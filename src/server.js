const config = require('../config/config');
const db = require('../db/models');
const { createApp } = require('./app');

async function main() {
  // Connect to PostgreSQL before listening, so a wrong database setting stops the server at startup.
  await db.sequelize.authenticate();

  if (!config.jwtSecret) {
    throw new Error('Set JWT_SECRET in backend/.env. Login tokens are signed with it.');
  }

  const app = createApp({
    db,
    corsOrigin: config.corsOrigin,
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
  });

  const server = app.listen(config.port, () => {
    const { host, port, database } = db.sequelize.config;
    console.log(`API listening on http://localhost:${config.port}`);
    console.log(`Database: postgres://${host}:${port}/${database}`);
  });

  function shutdown() {
    server.close(async () => {
      await db.sequelize.close();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
