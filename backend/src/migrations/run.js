require('dotenv').config();
const db = require('../config/database');
const schema = require('./001_initial_schema');

async function migrate(direction = 'up') {
  try {
    const sql = direction === 'down' ? schema.DOWN : schema.UP;
    console.log(`Running migration ${direction}...`);
    await db.query(sql);
    console.log(`Migration ${direction} completed successfully.`);
  } catch (err) {
    console.error(`Migration ${direction} failed:`, err.message);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

const direction = process.argv[2] === 'down' ? 'down' : 'up';
migrate(direction);
