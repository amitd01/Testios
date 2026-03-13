const { Pool } = require('pg');

module.exports = async () => {
  const adminPool = new Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  });
  try {
    // Terminate other connections first
    await adminPool.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = 'hiring_pipeline_test' AND pid <> pg_backend_pid()
    `);
    await adminPool.query('DROP DATABASE IF EXISTS hiring_pipeline_test');
  } finally {
    await adminPool.end();
  }
};
