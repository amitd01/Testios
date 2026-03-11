require('dotenv').config();
const db = require('../config/database');
const schema001 = require('./001_initial_schema');
const schema002 = require('./002_observability');
const schema003 = require('./003_instrument_types');
const schema004 = require('./004_user_overrides');

const migrations = [
  { name: '001_initial_schema', ...schema001 },
  { name: '002_observability', ...schema002 },
  { name: '003_instrument_types', ...schema003 },
  { name: '004_user_overrides', ...schema004 },
];

async function migrate(direction = 'up') {
  try {
    const ordered = direction === 'down' ? [...migrations].reverse() : migrations;

    for (const migration of ordered) {
      const sql = direction === 'down' ? migration.DOWN : migration.UP;
      console.log(`Running migration ${direction}: ${migration.name}...`);
      await db.query(sql);
      console.log(`Migration ${migration.name} ${direction} completed.`);
    }

    console.log(`All migrations ${direction} completed successfully.`);
  } catch (err) {
    console.error(`Migration ${direction} failed:`, err.message);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

const direction = process.argv[2] === 'down' ? 'down' : 'up';
migrate(direction);
