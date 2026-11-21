const express = require('express');
const cors = require('cors');
const { createCarRepository } = require('./cars/repository');
const { createCarsRouter } = require('./cars/routes');
const { errorHandler, notFoundHandler } = require('./errors');

function createApp({ db, corsOrigin = '*' }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    await db.sequelize.authenticate();
    res.json({ status: 'ok' });
  });

  app.use('/api/cars', createCarsRouter(createCarRepository(db.Car)));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
