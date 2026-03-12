require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../config/database');

async function run() {
  const direction = process.argv[2] || 'up';

  try {
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(200) PRIMARY KEY,
        ran_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const fs = require('fs');
    const path = require('path');
    const files = fs.readdirSync(__dirname)
      .filter(f => f.match(/^\d+_.*\.js$/) && f !== 'run.js')
      .sort();

    for (const file of files) {
      const migration = require(path.join(__dirname, file));
      const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);

      if (direction === 'up' && rows.length === 0) {
        console.log(`Running migration: ${file}`);
        await migration.up();
        await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      } else if (direction === 'down' && rows.length > 0) {
        console.log(`Rolling back migration: ${file}`);
        await migration.down();
        await pool.query('DELETE FROM _migrations WHERE name = $1', [file]);
      }
    }

    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
