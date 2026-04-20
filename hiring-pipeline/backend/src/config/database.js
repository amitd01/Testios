const { Pool } = require('pg');
const config = require('./index');

const pool = new Pool({ connectionString: config.databaseUrl });

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

module.exports = pool;
