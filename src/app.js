const express = require('express');
const cors = require('cors');
const { createAuth } = require('./auth/middleware');
const { createAuthRouter } = require('./auth/routes');
const { createCarRepository } = require('./cars/repository');
const { createCarsRouter } = require('./cars/routes');
const { errorHandler, notFoundHandler } = require('./errors');
const { createRoleRepository } = require('./roles/repository');
const { createPermissionsRouter, createRolesRouter } = require('./roles/routes');
const { createUserRepository } = require('./users/repository');
const { createUsersRouter } = require('./users/routes');

function createApp({ db, corsOrigin = '*', jwtSecret, jwtExpiresIn = '8h' }) {
  if (!jwtSecret) throw new Error('createApp needs a jwtSecret to sign login tokens');

  const userRepo = createUserRepository(db);
  const roleRepo = createRoleRepository(db);
  const auth = createAuth({ userRepo, jwtSecret });

  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    await db.sequelize.authenticate();
    res.json({ status: 'ok' });
  });

  // Everything except /api/health and /api/auth/login needs a logged-in user.
  app.use('/api/auth', createAuthRouter({ userRepo, auth, jwtSecret, jwtExpiresIn }));
  app.use('/api/cars', auth.authenticate, createCarsRouter(createCarRepository(db.Car), auth));
  app.use('/api/users', auth.authenticate, createUsersRouter(userRepo, auth));
  app.use('/api/roles', auth.authenticate, createRolesRouter(roleRepo, auth));
  app.use('/api/permissions', auth.authenticate, createPermissionsRouter(roleRepo, auth));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
