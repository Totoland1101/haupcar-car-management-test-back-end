const assert = require('node:assert/strict');
const { after, beforeEach, describe, test } = require('node:test');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createApp } = require('../src/app');
const { verifyPassword } = require('../src/auth/password');
const { JWT_SECRET, asUser, createUser, login, loginAs, resetUsersAndRoles } = require('./helpers');

// Never run against the development database. npm test migrates the test database first.
process.env.NODE_ENV = 'test';
const db = require('../db/models');

const app = createApp({ db, jwtSecret: JWT_SECRET });
const ALL_PERMISSIONS = [
  'car.create',
  'car.delete',
  'car.update',
  'car.view',
  'role.manage',
  'user.approve',
  'user.manage',
];

let admin;

beforeEach(async () => {
  await db.Car.truncate({ restartIdentity: true });
  await resetUsersAndRoles(db);
  admin = await loginAs(app, db, 'admin', 'Admin');
});

after(async () => {
  await db.sequelize.close();
});

async function roleId(name) {
  const role = await db.Role.findOne({ where: { name } });
  return role.id;
}

describe('POST /api/auth/login', () => {
  test('returns a token and the user with their permissions', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password123' })
      .expect(200);

    assert.equal(typeof res.body.token, 'string');
    assert.equal(res.body.user.username, 'admin');
    assert.equal(res.body.user.role.name, 'Admin');
    assert.deepEqual(res.body.user.permissions, ALL_PERMISSIONS);
    assert.equal('password' in res.body.user, false);
    assert.equal(res.body.user.profile.firstName, 'admin');
  });

  test('ignores letter case in the username', async () => {
    await request(app).post('/api/auth/login').send({ username: ' ADMIN ', password: 'password123' }).expect(200);
  });

  test('gives the same 401 for a wrong password and an unknown username', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'nope' })
      .expect(401);
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'password123' })
      .expect(401);

    assert.equal(wrongPassword.body.error.message, 'Incorrect username or password');
    assert.deepEqual(unknownUser.body, wrongPassword.body);
  });

  test('rejects a disabled account', async () => {
    await createUser(db, { username: 'gone', isActive: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'gone', password: 'password123' })
      .expect(403);
    assert.match(res.body.error.message, /disabled/);
  });

  test('requires a username and password', async () => {
    const res = await request(app).post('/api/auth/login').send({}).expect(400);
    assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['password', 'username']);
  });

  test('records when the user last logged in', async () => {
    const user = await db.User.findOne({ where: { username: 'admin' } });
    assert.ok(user.lastLoginAt);
  });
});

test('passwords are stored as one salted scrypt hash, not as plain text', async () => {
  await createUser(db, { username: 'twin1', password: 'same-password' });
  await createUser(db, { username: 'twin2', password: 'same-password' });

  const [one, two] = await db.User.scope('withPassword').findAll({
    where: { username: ['twin1', 'twin2'] },
    order: [['username', 'ASC']],
  });

  // scrypt$<salt>$<hash>: the salt travels with the hash in a single column.
  assert.match(one.password, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(one.password.split('$')[1], two.password.split('$')[1]);
  assert.notEqual(one.password, two.password);
  assert.ok(await verifyPassword('same-password', one.password));
  assert.equal(await verifyPassword('other-password', one.password), false);

  // The default scope leaves the password columns out.
  const plain = await db.User.findOne({ where: { username: 'twin1' } });
  assert.equal(plain.password, undefined);
});

describe('protected routes', () => {
  test('need a token', async () => {
    const res = await request(app).get('/api/cars').expect(401);
    assert.equal(res.body.error.message, 'Please log in');
  });

  test('reject a token signed with another secret, or an expired one', async () => {
    const user = await db.User.findOne({ where: { username: 'admin' } });
    const forged = jwt.sign({}, 'some-other-secret', { subject: String(user.id) });
    const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET, { subject: String(user.id) });

    await asUser(app, forged).get('/api/cars').expect(401);
    await asUser(app, expired).get('/api/cars').expect(401);
  });

  test('stop working as soon as the account is disabled', async () => {
    await admin.get('/api/cars').expect(200);
    await db.User.update({ isActive: false }, { where: { username: 'admin' } });
    await admin.get('/api/cars').expect(401);
  });

  test('GET /api/auth/me returns the logged-in user', async () => {
    const res = await admin.get('/api/auth/me').expect(200);
    assert.equal(res.body.username, 'admin');
    assert.deepEqual(res.body.permissions, ALL_PERMISSIONS);
  });

  test('/api/health stays public', async () => {
    await request(app).get('/api/health').expect(200);
  });
});

describe('permissions', () => {
  const car = { registrationNumber: '1กข 1234', province: 'กรุงเทพมหานคร', brand: 'Toyota', model: 'Yaris' };

  test('a viewer can look at cars but not change them', async () => {
    const viewer = await loginAs(app, db, 'viewer', 'Viewer');
    const { body: created } = await admin.post('/api/cars').send(car).expect(201);

    await viewer.get('/api/cars').expect(200);
    await viewer.get(`/api/cars/${created.id}`).expect(200);
    const res = await viewer.post('/api/cars').send(car).expect(403);
    assert.equal(res.body.error.message, 'You do not have permission to do this');
    await viewer.put(`/api/cars/${created.id}`).send(car).expect(403);
    await viewer.delete(`/api/cars/${created.id}`).expect(403);
  });

  test('staff can add and edit cars but not delete them or manage users', async () => {
    const staff = await loginAs(app, db, 'staff', 'Staff');

    const { body: created } = await staff.post('/api/cars').send(car).expect(201);
    await staff.put(`/api/cars/${created.id}`).send({ ...car, model: 'Yaris Ativ' }).expect(200);
    await staff.delete(`/api/cars/${created.id}`).expect(403);
    await staff.get('/api/users').expect(403);
    await staff.get('/api/roles').expect(403);
  });

  test('changes to a role apply to users who are already logged in', async () => {
    const { body: role } = await admin
      .post('/api/roles')
      .send({ name: 'Auditor', permissions: ['car.view'] })
      .expect(201);
    await createUser(db, { username: 'auditor', role: 'Auditor' });
    const auditor = asUser(app, await login(app, 'auditor'));

    await auditor.get('/api/cars').expect(200);
    await admin.put(`/api/roles/${role.id}`).send({ name: 'Auditor', permissions: [] }).expect(200);
    await auditor.get('/api/cars').expect(403);
  });
});

describe('/api/users', () => {
  const newUser = async (overrides = {}) => ({
    username: 'somchai',
    profile: { firstName: 'Somchai', lastName: 'Jaidee' },
    password: 'first-password',
    roleId: await roleId('Staff'),
    ...overrides,
  });

  test('creates a user who can then log in', async () => {
    const res = await admin.post('/api/users').send(await newUser()).expect(201);

    assert.equal(res.body.username, 'somchai');
    assert.equal(res.body.isActive, true);
    assert.equal(res.body.role.name, 'Staff');
    assert.equal('password' in res.body, false);
    assert.equal(res.body.name, 'Somchai Jaidee');
    assert.deepEqual(res.body.profile, {
      firstName: 'Somchai',
      lastName: 'Jaidee',
      email: null,
      phone: null,
      jobTitle: null,
      department: null,
    });
    await login(app, 'somchai', 'first-password');
  });

  test('lists users with their role', async () => {
    await admin.post('/api/users').send(await newUser()).expect(201);
    const res = await admin.get('/api/users').expect(200);

    assert.deepEqual(
      res.body.data.map((u) => [u.username, u.role.name]),
      [
        ['admin', 'Admin'],
        ['somchai', 'Staff'],
      ],
    );
  });

  test('stores usernames in lower case and rejects duplicates', async () => {
    const res = await admin.post('/api/users').send(await newUser({ username: 'SomChai' })).expect(201);
    assert.equal(res.body.username, 'somchai');

    const dup = await admin.post('/api/users').send(await newUser()).expect(409);
    assert.deepEqual(dup.body.error.details, [{ field: 'username', message: 'This username is already taken' }]);
  });

  test('validates the fields', async () => {
    const res = await admin
      .post('/api/users')
      .send({ username: 'a b', profile: { firstName: '', email: 'not-an-email' }, password: 'short' })
      .expect(400);
    assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), [
      'password',
      'profile.email',
      'profile.firstName',
      'roleId',
      'username',
    ]);
  });

  test('rejects a role that does not exist', async () => {
    const res = await admin.post('/api/users').send(await newUser({ roleId: 9999 })).expect(400);
    assert.equal(res.body.error.details[0].field, 'roleId');
  });

  test('keeps the password when an update leaves it out, and changes it when given', async () => {
    const { body: user } = await admin.post('/api/users').send(await newUser()).expect(201);
    const { password, ...withoutPassword } = await newUser();

    await admin
      .put(`/api/users/${user.id}`)
      .send({ ...withoutPassword, profile: { firstName: 'Somchai', lastName: 'J.' } })
      .expect(200);
    await login(app, 'somchai', 'first-password');

    await admin.put(`/api/users/${user.id}`).send({ ...withoutPassword, password: 'second-password' }).expect(200);
    await request(app).post('/api/auth/login').send({ username: 'somchai', password: 'first-password' }).expect(401);
    await login(app, 'somchai', 'second-password');
  });

  test('stops you from disabling, demoting or deleting your own account', async () => {
    const me = await db.User.findOne({ where: { username: 'admin' }, include: [{ model: db.Profile, as: 'profile' }] });
    const base = { username: 'admin', profile: { firstName: 'Admin' }, roleId: me.profile.roleId, isActive: true };

    let res = await admin.put(`/api/users/${me.id}`).send({ ...base, isActive: false }).expect(400);
    assert.equal(res.body.error.details[0].field, 'isActive');
    res = await admin.put(`/api/users/${me.id}`).send({ ...base, roleId: await roleId('Viewer') }).expect(400);
    assert.equal(res.body.error.details[0].field, 'roleId');
    await admin.delete(`/api/users/${me.id}`).expect(409);

    // Changing your own name is fine.
    await admin.put(`/api/users/${me.id}`).send({ ...base, profile: { firstName: 'Head', lastName: 'admin' } }).expect(200);
  });

  test('deletes a user', async () => {
    const { body: user } = await admin.post('/api/users').send(await newUser()).expect(201);
    await admin.delete(`/api/users/${user.id}`).expect(204);
    await admin.get(`/api/users/${user.id}`).expect(404);
  });
});

describe('/api/roles', () => {
  test('lists the default roles with their permissions and user counts', async () => {
    const res = await admin.get('/api/roles').expect(200);
    const byName = Object.fromEntries(res.body.data.map((role) => [role.name, role]));

    assert.deepEqual(Object.keys(byName), ['Admin', 'Staff', 'Viewer']);
    assert.equal(byName.Admin.isSystem, true);
    assert.deepEqual(byName.Admin.permissions, ALL_PERMISSIONS);
    assert.deepEqual(byName.Viewer.permissions, ['car.view']);
    assert.equal(byName.Admin.userCount, 1);
    assert.equal(byName.Staff.userCount, 0);
  });

  test('creates a role with permissions', async () => {
    const res = await admin
      .post('/api/roles')
      .send({ name: 'Fleet manager', description: 'Runs the fleet', permissions: ['car.view', 'car.delete'] })
      .expect(201);

    assert.equal(res.body.name, 'Fleet manager');
    assert.deepEqual(res.body.permissions, ['car.delete', 'car.view']);
    assert.equal(res.body.isSystem, false);
  });

  test('rejects unknown permission codes and duplicate names', async () => {
    let res = await admin.post('/api/roles').send({ name: 'Odd', permissions: ['car.fly'] }).expect(400);
    assert.equal(res.body.error.message, 'Unknown permission: car.fly');

    res = await admin.post('/api/roles').send({ name: 'Staff', permissions: [] }).expect(409);
    assert.equal(res.body.error.details[0].field, 'name');
  });

  test('will not edit or delete a system role', async () => {
    const id = await roleId('Admin');
    await admin.put(`/api/roles/${id}`).send({ name: 'Admin', permissions: [] }).expect(409);
    await admin.delete(`/api/roles/${id}`).expect(409);
  });

  test('will not delete a role that users still have', async () => {
    const { body: role } = await admin.post('/api/roles').send({ name: 'Temp', permissions: [] }).expect(201);
    await createUser(db, { username: 'temp', role: 'Temp' });

    const res = await admin.delete(`/api/roles/${role.id}`).expect(409);
    assert.match(res.body.error.message, /1 user still has this role/);

    await db.User.destroy({ where: { username: 'temp' } });
    await admin.delete(`/api/roles/${role.id}`).expect(204);
  });

  test('GET /api/permissions lists every permission', async () => {
    const res = await admin.get('/api/permissions').expect(200);
    assert.deepEqual(res.body.data.map((p) => p.code).sort(), ALL_PERMISSIONS);
    assert.ok(res.body.data.every((p) => p.name && p.module));
  });
});
