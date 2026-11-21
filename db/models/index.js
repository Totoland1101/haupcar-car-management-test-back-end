'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
// Return BIGINT values such as COUNT(*) as numbers instead of strings.
require('pg').defaults.parseInt8 = true;
const config = require('../../config/config');

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const db = {};

if (!config[env]) {
  throw new Error(`config/config.js has no database settings for NODE_ENV "${env}"`);
}

const { database, username, password, host, port, dialect } = config[env];

const sequelize = new Sequelize(database, username, password, {
  host,
  port,
  dialect,
  logging: config.dbLogging ? console.log : false,
});

fs.readdirSync(__dirname)
  .filter((file) => file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js')
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
