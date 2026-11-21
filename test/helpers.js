const { Op } = require('sequelize');
const request = require('supertest');
const { hashPassword } = require('../src/auth/password');

const JWT_SECRET = 'test-secret';
const DEFAULT_ROLES = ['Admin', 'Staff', 'Viewer'];

// Back to what the migrations create: the default roles and no users.
async function resetUsersAndRoles(db) {
  await db.User.truncate({ restartIdentity: true });
  await db.Role.destroy({ where: { name: { [Op.notIn]: DEFAULT_ROLES } } });
}

async function createUser(db, { username, password = 'password123', role = 'Admin', isActive = true }) {
  const { id: roleId } = await db.Role.findOne({ where: { name: role } });
  const { hash, salt } = await hashPassword(password);
  return db.User.create({ username, name: username, roleId, isActive, passwordHash: hash, passwordSalt: salt });
}

async function login(app, username, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ username, password }).expect(200);
  return res.body.token;
}

// supertest that sends the user's token with every request.
function asUser(app, token) {
  const withToken = (req) => req.set('Authorization', `Bearer ${token}`);
  return {
    get: (url) => withToken(request(app).get(url)),
    post: (url) => withToken(request(app).post(url)),
    put: (url) => withToken(request(app).put(url)),
    delete: (url) => withToken(request(app).delete(url)),
  };
}

// Creates a user with the given role and logs them in.
async function loginAs(app, db, username, role) {
  await createUser(db, { username, role });
  return asUser(app, await login(app, username));
}

module.exports = { JWT_SECRET, asUser, createUser, login, loginAs, resetUsersAndRoles };
