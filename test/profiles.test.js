const assert = require('node:assert/strict');
const { after, beforeEach, describe, test } = require('node:test');
const { createApp } = require('../src/app');
const { JWT_SECRET, loginAs, resetUsersAndRoles } = require('./helpers');

// Never run against the development database. npm test migrates the test database first.
process.env.NODE_ENV = 'test';
const db = require('../db/models');

const app = createApp({ db, jwtSecret: JWT_SECRET });

let admin;

beforeEach(async () => {
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

async function createDepartment(name) {
  const res = await admin.post('/api/departments').send({ name }).expect(201);
  return res.body;
}

test('haup_users only holds the account, and the person lives in haup_profiles', async () => {
  const users = await db.sequelize.getQueryInterface().describeTable('haup_users');
  const profiles = await db.sequelize.getQueryInterface().describeTable('haup_profiles');

  assert.equal('name' in users, false);
  assert.equal('role_id' in users, false);
  assert.equal('password_salt' in users, false);
  assert.ok('password' in users);
  for (const column of ['user_id', 'first_name', 'last_name', 'email', 'phone', 'job_title', 'department_id', 'role_id']) {
    assert.ok(column in profiles, column);
  }
});

describe('profiles through /api/users', () => {
  test('an admin creates a user with a full profile', async () => {
    const sales = await createDepartment('Sales');
    const res = await admin
      .post('/api/users')
      .send({
        username: 'malee',
        password: 'malee-password',
        roleId: await roleId('Staff'),
        profile: {
          firstName: 'Malee',
          lastName: 'Srisuk',
          email: 'malee@example.com',
          phone: '+66 81 234 5678',
          jobTitle: 'Fleet coordinator',
          departmentId: sales.id,
        },
      })
      .expect(201);

    assert.equal(res.body.name, 'Malee Srisuk');
    assert.equal(res.body.role.name, 'Staff');
    assert.deepEqual(res.body.profile.department, { id: sales.id, name: 'Sales' });

    const profile = await db.Profile.findOne({ where: { userId: res.body.id } });
    assert.equal(profile.jobTitle, 'Fleet coordinator');
    assert.equal(profile.roleId, await roleId('Staff'));
  });

  test('rejects a department that does not exist', async () => {
    const res = await admin
      .post('/api/users')
      .send({ username: 'xavier', password: 'password123', roleId: await roleId('Staff'), profile: { firstName: 'X', departmentId: 9999 } })
      .expect(400);
    assert.equal(res.body.error.details[0].field, 'profile.departmentId');
  });

  test('deleting a user deletes their profile', async () => {
    const res = await admin
      .post('/api/users')
      .send({ username: 'gone', password: 'password123', roleId: await roleId('Viewer'), profile: { firstName: 'Gone' } })
      .expect(201);
    await admin.delete(`/api/users/${res.body.id}`).expect(204);
    assert.equal(await db.Profile.count({ where: { userId: res.body.id } }), 0);
  });
});

describe('PUT /api/auth/me/profile', () => {
  test('lets any user edit their own details', async () => {
    const viewer = await loginAs(app, db, 'viewer', 'Viewer');
    const ops = await createDepartment('Operations');

    const res = await viewer
      .put('/api/auth/me/profile')
      .send({ firstName: 'Wichai', lastName: 'Dee', phone: '02 123 4567', jobTitle: 'Driver', departmentId: ops.id })
      .expect(200);

    assert.equal(res.body.name, 'Wichai Dee');
    assert.equal(res.body.profile.department.name, 'Operations');
    assert.deepEqual(res.body.permissions, ['car.view']);
  });

  test('cannot change the role', async () => {
    const viewer = await loginAs(app, db, 'viewer', 'Viewer');
    await viewer.put('/api/auth/me/profile').send({ firstName: 'Viewer', roleId: await roleId('Admin') }).expect(200);

    const me = await viewer.get('/api/auth/me').expect(200);
    assert.equal(me.body.role.name, 'Viewer');
  });

  test('validates the fields', async () => {
    const res = await admin
      .put('/api/auth/me/profile')
      .send({ firstName: ' ', email: 'nope', phone: 'call me', departmentId: 9999 })
      .expect(400);
    assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['email', 'firstName', 'phone']);

    const missing = await admin.put('/api/auth/me/profile').send({ firstName: 'A', departmentId: 9999 }).expect(400);
    assert.equal(missing.body.error.details[0].field, 'departmentId');
  });

  test('needs a login', async () => {
    const request = require('supertest');
    await request(app).put('/api/auth/me/profile').send({ firstName: 'A' }).expect(401);
  });
});

describe('/api/departments', () => {
  test('anyone logged in can list them, with how many people are in each', async () => {
    const sales = await createDepartment('Sales');
    await createDepartment('Accounting');
    await admin.put('/api/auth/me/profile').send({ firstName: 'Admin', departmentId: sales.id }).expect(200);

    const viewer = await loginAs(app, db, 'viewer', 'Viewer');
    const res = await viewer.get('/api/departments').expect(200);
    assert.deepEqual(
      res.body.data.map((d) => [d.name, d.userCount]),
      [
        ['Accounting', 0],
        ['Sales', 1],
      ]
    );
  });

  test('only user managers can change them', async () => {
    const staff = await loginAs(app, db, 'staff', 'Staff');
    await staff.post('/api/departments').send({ name: 'Sales' }).expect(403);
  });

  test('renames, rejects duplicates and validates the name', async () => {
    const sales = await createDepartment('Sales');
    await createDepartment('Accounting');

    const renamed = await admin.put(`/api/departments/${sales.id}`).send({ name: 'Sales and marketing' }).expect(200);
    assert.equal(renamed.body.name, 'Sales and marketing');

    const dup = await admin.post('/api/departments').send({ name: 'Accounting' }).expect(409);
    assert.equal(dup.body.error.details[0].field, 'name');
    await admin.post('/api/departments').send({ name: '' }).expect(400);
    await admin.put('/api/departments/9999').send({ name: 'X' }).expect(404);
  });

  test('deleting one leaves its people without a department', async () => {
    const sales = await createDepartment('Sales');
    await admin.put('/api/auth/me/profile').send({ firstName: 'Admin', departmentId: sales.id }).expect(200);

    await admin.delete(`/api/departments/${sales.id}`).expect(204);
    const me = await admin.get('/api/auth/me').expect(200);
    assert.equal(me.body.profile.department, null);
  });
});

describe('changing passwords', () => {
  const request = require('supertest');
  const loginWith = (username, password) => request(app).post('/api/auth/login').send({ username, password });

  test('a user changes their own password after giving the current one', async () => {
    const viewer = await loginAs(app, db, 'viewer', 'Viewer');

    const wrong = await viewer
      .put('/api/auth/me/password')
      .send({ currentPassword: 'not-it', newPassword: 'brand-new-password' })
      .expect(400);
    assert.deepEqual(wrong.body.error.details, [{ field: 'currentPassword', message: 'The current password is wrong' }]);

    const short = await viewer.put('/api/auth/me/password').send({ currentPassword: 'password123', newPassword: 'short' }).expect(400);
    assert.equal(short.body.error.details[0].field, 'newPassword');

    await viewer.put('/api/auth/me/password').send({ currentPassword: 'password123', newPassword: 'brand-new-password' }).expect(204);
    await loginWith('viewer', 'password123').expect(401);
    await loginWith('viewer', 'brand-new-password').expect(200);
  });

  test('an admin sets a new password for another account', async () => {
    await loginAs(app, db, 'staff', 'Staff');
    const staff = await db.User.findOne({ where: { username: 'staff' } });

    await admin.put(`/api/users/${staff.id}/password`).send({ password: 'reset-by-admin' }).expect(204);
    await loginWith('staff', 'reset-by-admin').expect(200);

    await admin.put('/api/users/9999/password').send({ password: 'reset-by-admin' }).expect(404);
    await admin.put(`/api/users/${staff.id}/password`).send({ password: 'x' }).expect(400);
  });

  test('only user managers can reset someone else\'s password', async () => {
    const staff = await loginAs(app, db, 'staff', 'Staff');
    const me = await db.User.findOne({ where: { username: 'admin' } });
    await staff.put(`/api/users/${me.id}/password`).send({ password: 'taken-over!' }).expect(403);
  });
});
