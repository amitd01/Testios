const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test',
    });
  }
  return pool;
}

function getAuthToken() {
  return jwt.sign(
    { userId: 1, username: 'testadmin', role: 'admin' },
    'test-secret',
    { expiresIn: '1h' }
  );
}

async function cleanTables() {
  const p = getPool();
  await p.query(`
    DELETE FROM interview_bookings;
    DELETE FROM interview_slots;
    DELETE FROM briefings;
    DELETE FROM cv_submissions;
    DELETE FROM hiring_outcomes;
    DELETE FROM requisition_consultants;
    DELETE FROM candidates;
    DELETE FROM requisitions;
    DELETE FROM consultant_specialties;
    DELETE FROM consultants;
  `);
}

async function seedBasicData() {
  const p = getPool();

  // Create a consultant
  const { rows: [consultant] } = await p.query(
    `INSERT INTO consultants (firm_name, contact_name, contact_email, active)
     VALUES ('Test Firm', 'Test Contact', 'test@firm.com', true) RETURNING *`
  );

  // Add specialty
  const { rows: [salesFamily] } = await p.query("SELECT id FROM role_families WHERE name = 'Sales'");
  await p.query(
    'INSERT INTO consultant_specialties (consultant_id, role_family_id) VALUES ($1, $2)',
    [consultant.id, salesFamily.id]
  );

  // Create a requisition
  const { rows: [requisition] } = await p.query(
    `INSERT INTO requisitions (title, role_family_id, hiring_manager_name, description, field_expectations, compensation_range)
     VALUES ('Test Sales Role', $1, 'Test Manager', 'Sell products to customers', 'Travel 50%', '15-20 LPA') RETURNING *`,
    [salesFamily.id]
  );

  // Assign consultant to requisition
  await p.query(
    'INSERT INTO requisition_consultants (requisition_id, consultant_id, computed_rank) VALUES ($1, $2, 1)',
    [requisition.id, consultant.id]
  );

  // Create a candidate
  const { rows: [candidate] } = await p.query(
    `INSERT INTO candidates (name, email, source_consultant_id)
     VALUES ('Test Candidate', 'candidate@test.com', $1) RETURNING *`,
    [consultant.id]
  );

  return { consultant, requisition, candidate, salesFamilyId: salesFamily.id };
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, getAuthToken, cleanTables, seedBasicData, closePool };
