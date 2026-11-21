const assert = require('node:assert/strict');
const { after, beforeEach, describe, test } = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { JWT_SECRET, loginAs, resetUsersAndRoles } = require('./helpers');

// Never run against the development database. npm test migrates the test database first.
process.env.NODE_ENV = 'test';
const db = require('../db/models');

const app = createApp({ db, jwtSecret: JWT_SECRET });
const somchai = {
  username: 'somchai',
  password: 'my-password',
  profile: { firstName: 'Somchai', lastName: 'Jaidee', email: 'somchai@example.com' },
};

let admin;

beforeEach(async () => {
  await resetUsersAndRoles(db);
  admin = await loginAs(app, db, 'admin', 'Admin');
});

after(async () => {
  await db.sequelize.close();
});

function register(body = somchai) {
  return request(app).post('/api/auth/register').send(body);
}

function loginRequest(username = 'somchai', password = 'my-password') {
  return request(app).post('/api/auth/login').send({ username, password });
}

async function registrationId(username = 'somchai') {
  const user = await db.User.findOne({ where: { username } });
  return user.id;
}

async function roleId(name) {
  const role = await db.Role.findOne({ where: { name } });
  return role.id;
}

describe('POST /api/auth/register', () => {
  test('creates a pending account with no role and no token', async () => {
    const res = await register().expect(201);

    assert.match(res.body.message, /once an admin approves/);
    assert.equal('token' in res.body, false);

    const user = await db.User.scope('withPassword').findOne({
      where: { username: 'somchai' },
      include: [{ model: db.Profile, as: 'profile' }],
    });
    assert.equal(user.status, 'pending');
    assert.equal(user.profile.roleId, null);
    assert.equal(user.profile.firstName, 'Somchai');
    assert.equal(user.profile.email, 'somchai@example.com');
    assert.match(user.password, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  test('uses the same rules as an admin creating a user', async () => {
    const res = await register({ username: 'a b', profile: { firstName: '' }, password: 'short' }).expect(400);
    assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['password', 'profile.firstName', 'username']);
  });

  test('rejects a username that is taken, including by another registration', async () => {
    await register().expect(201);
    const res = await register({ ...somchai, username: 'SOMCHAI' }).expect(409);
    assert.equal(res.body.error.details[0].field, 'username');

    await register({ ...somchai, username: 'admin' }).expect(409);
  });

  test('does not need a token', async () => {
    await register().expect(201);
  });
});

describe('logging in before approval', () => {
  test('a pending account is told to wait', async () => {
    await register().expect(201);
    const res = await loginRequest().expect(403);
    assert.equal(res.body.error.message, 'Your account is waiting for an admin to approve it');
  });

  test('a wrong password still gets the usual 401, so the status stays private', async () => {
    await register().expect(201);
    await loginRequest('somchai', 'wrong-password').expect(401);
  });

  test('a rejected account is told it was not approved', async () => {
    await register().expect(201);
    await admin.post(`/api/registrations/${await registrationId()}/reject`).expect(200);

    const res = await loginRequest().expect(403);
    assert.match(res.body.error.message, /not approved/);
  });
});

describe('/api/registrations', () => {
  test('lists waiting registrations with counts', async () => {
    await register().expect(201);
    await register({ ...somchai, username: 'malee', profile: { firstName: 'Malee' } }).expect(201);
    await admin.post(`/api/registrations/${await registrationId('malee')}/reject`).expect(200);

    const pending = await admin.get('/api/registrations').expect(200);
    assert.deepEqual(pending.body.data.map((u) => u.username), ['somchai']);
    assert.deepEqual(pending.body.counts, { pending: 1, rejected: 1 });

    const rejected = await admin.get('/api/registrations?status=rejected').expect(200);
    assert.deepEqual(rejected.body.data.map((u) => u.username), ['malee']);
    assert.equal(rejected.body.data[0].reviewedBy.name, 'admin');
  });

  test('pending accounts stay out of the users list', async () => {
    await register().expect(201);
    const res = await admin.get('/api/users').expect(200);
    assert.deepEqual(res.body.data.map((u) => u.username), ['admin']);
  });

  test('approving gives the account a role, and then it can log in', async () => {
    await register().expect(201);
    const id = await registrationId();

    const res = await admin
      .post(`/api/registrations/${id}/approve`)
      .send({ roleId: await roleId('Staff') })
      .expect(200);
    assert.equal(res.body.status, 'approved');
    assert.equal(res.body.role.name, 'Staff');
    assert.equal(res.body.reviewedBy.name, 'admin');
    assert.ok(res.body.reviewedAt);

    const login = await loginRequest().expect(200);
    assert.deepEqual(login.body.user.permissions, ['car.create', 'car.update', 'car.view']);
  });

  test('approving needs a role that exists', async () => {
    await register().expect(201);
    const id = await registrationId();

    await admin.post(`/api/registrations/${id}/approve`).send({}).expect(400);
    const res = await admin.post(`/api/registrations/${id}/approve`).send({ roleId: 9999 }).expect(400);
    assert.equal(res.body.error.details[0].field, 'roleId');
  });

  test('a rejected registration can still be approved later', async () => {
    await register().expect(201);
    const id = await registrationId();
    await admin.post(`/api/registrations/${id}/reject`).expect(200);

    await admin.post(`/api/registrations/${id}/approve`).send({ roleId: await roleId('Viewer') }).expect(200);
    await loginRequest().expect(200);
  });

  test('will not approve an approved account or reject anything that is not waiting', async () => {
    await register().expect(201);
    const id = await registrationId();
    await admin.post(`/api/registrations/${id}/approve`).send({ roleId: await roleId('Viewer') }).expect(200);

    await admin.post(`/api/registrations/${id}/approve`).send({ roleId: await roleId('Viewer') }).expect(409);
    await admin.post(`/api/registrations/${id}/reject`).expect(409);
  });

  test('returns 404 for an unknown id', async () => {
    await admin.post('/api/registrations/9999/reject').expect(404);
  });

  test('needs the user.approve permission', async () => {
    await register().expect(201);
    const staff = await loginAs(app, db, 'staff', 'Staff');

    await staff.get('/api/registrations').expect(403);
    await staff.post(`/api/registrations/${await registrationId()}/reject`).expect(403);
  });

  test('a role with only user.approve can approve and see the role list', async () => {
    await admin.post('/api/roles').send({ name: 'Approver', permissions: ['user.approve'] }).expect(201);
    const approver = await loginAs(app, db, 'approver', 'Approver');
    await register().expect(201);

    const roles = await approver.get('/api/roles').expect(200);
    const viewer = roles.body.data.find((role) => role.name === 'Viewer');
    await approver.post(`/api/registrations/${await registrationId()}/approve`).send({ roleId: viewer.id }).expect(200);
    await approver.get('/api/users').expect(403);
  });
});
