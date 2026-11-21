// Runs sequelize-cli with shorter commands:
//   npm run migration up                         apply pending migrations
//   npm run migration down                       undo the last migration
//   npm run migration down -- --name <file>      undo one migration by file name
//   npm run migration status                     list applied and pending migrations
//   npm run migration generate <name>            new file in db/migrations
// NODE_ENV picks the database from config/config.js (default: development).
const path = require('path');
const { spawnSync } = require('child_process');

const commands = {
  up: ['db:migrate'],
  down: ['db:migrate:undo'],
  status: ['db:migrate:status'],
  generate: ['migration:generate', '--name'],
};

const [action, ...args] = process.argv.slice(2);

if (!commands[action]) {
  console.error(`Usage: npm run migration <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [require.resolve('sequelize-cli/lib/sequelize'), ...commands[action], ...args],
  { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' },
);

process.exit(result.status ?? 1);
