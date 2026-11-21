const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '../.env'));
} catch {
  // No .env file. The defaults below match docker-compose.yml.
}

// Settings shared by every environment. sequelize-cli reads the environment
// named by NODE_ENV (default: development).
const database = {
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  // Every table in this project starts with haup_, including sequelize-cli's own.
  migrationStorageTableName: 'haup_sequelize_meta',
  logging: false,
};

module.exports = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dbLogging: process.env.DB_LOGGING === 'true',

  development: {
    ...database,
    database: process.env.DB_NAME || 'haupcar',
  },
  test: {
    ...database,
    database: process.env.DB_NAME_TEST || 'haupcar_test',
  },
  production: {
    ...database,
    database: process.env.DB_NAME || 'haupcar',
  },
};
