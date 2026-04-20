/**
 * Jest global setup — creates test database and runs migrations.
 */
const { Pool } = require('pg');
const path = require('path');

module.exports = async () => {
  // Connect to default postgres DB to create test DB
  const adminPool = new Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  });

  try {
    await adminPool.query('DROP DATABASE IF EXISTS hiring_pipeline_test');
    await adminPool.query('CREATE DATABASE hiring_pipeline_test');
  } finally {
    await adminPool.end();
  }

  // Run migrations against test DB
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.ANTHROPIC_API_KEY = '';

  // Clear the database module cache so it picks up new DATABASE_URL
  const dbModulePath = require.resolve('../src/config/database');
  delete require.cache[dbModulePath];
  const configPath = require.resolve('../src/config/index');
  delete require.cache[configPath];

  const testPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Run migration SQL directly
  const migration1 = require('../src/migrations/001_hiring_pipeline');
  const migration2 = require('../src/migrations/002_interview_scheduling');
  const migration3 = require('../src/migrations/003_cv_triage');

  // We need to temporarily replace the pool the migrations use
  const origPool = require('../src/config/database');

  // Execute migration SQL directly on test pool
  await testPool.query(`
    CREATE TABLE IF NOT EXISTS role_families (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    INSERT INTO role_families (name) VALUES
      ('Engineering'), ('Sales'), ('Marketing'), ('Product'),
      ('Operations'), ('Finance'), ('HR'), ('Leadership')
    ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS consultants (
      id SERIAL PRIMARY KEY,
      firm_name VARCHAR(200) NOT NULL,
      contact_name VARCHAR(200),
      contact_email VARCHAR(200),
      phone VARCHAR(50),
      notes TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consultant_specialties (
      consultant_id INTEGER REFERENCES consultants(id),
      role_family_id INTEGER REFERENCES role_families(id),
      PRIMARY KEY (consultant_id, role_family_id)
    );

    CREATE TABLE IF NOT EXISTS requisitions (
      id SERIAL PRIMARY KEY,
      title VARCHAR(300) NOT NULL,
      role_family_id INTEGER REFERENCES role_families(id),
      hiring_manager_name VARCHAR(200),
      hiring_manager_email VARCHAR(200),
      description TEXT,
      field_expectations TEXT,
      compensation_range VARCHAR(100),
      team_info TEXT,
      status VARCHAR(30) DEFAULT 'open',
      filled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS requisition_consultants (
      requisition_id INTEGER REFERENCES requisitions(id),
      consultant_id INTEGER REFERENCES consultants(id),
      computed_rank INTEGER,
      assigned_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (requisition_id, consultant_id)
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(200),
      phone VARCHAR(50),
      source_consultant_id INTEGER REFERENCES consultants(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cv_submissions (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER REFERENCES requisitions(id),
      candidate_id INTEGER REFERENCES candidates(id),
      consultant_id INTEGER REFERENCES consultants(id),
      cv_file_path VARCHAR(500),
      consultant_rationale TEXT,
      status VARCHAR(30) DEFAULT 'submitted',
      submitted_at TIMESTAMP DEFAULT NOW(),
      screened_at TIMESTAMP,
      shortlisted_at TIMESTAMP,
      sent_to_manager_at TIMESTAMP,
      interview_scheduled_at TIMESTAMP,
      resolved_at TIMESTAMP,
      rejection_reason TEXT,
      fit_score INTEGER,
      fit_analysis JSONB,
      scored_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS briefings (
      id SERIAL PRIMARY KEY,
      cv_submission_id INTEGER REFERENCES cv_submissions(id),
      candidate_id INTEGER REFERENCES candidates(id),
      requisition_id INTEGER REFERENCES requisitions(id),
      link_token UUID DEFAULT gen_random_uuid() UNIQUE,
      status VARCHAR(30) DEFAULT 'pending',
      transcript JSONB DEFAULT '[]',
      summary TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hiring_outcomes (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER REFERENCES requisitions(id),
      consultant_id INTEGER REFERENCES consultants(id),
      role_family_id INTEGER REFERENCES role_families(id),
      candidate_id INTEGER REFERENCES candidates(id),
      submitted BOOLEAN DEFAULT false,
      interviewed BOOLEAN DEFAULT false,
      offered BOOLEAN DEFAULT false,
      accepted BOOLEAN DEFAULT false,
      time_to_fill_days INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS interview_slots (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER REFERENCES requisitions(id),
      interviewer_name VARCHAR(200) NOT NULL,
      interviewer_email VARCHAR(200),
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      is_booked BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS interview_bookings (
      id SERIAL PRIMARY KEY,
      slot_id INTEGER REFERENCES interview_slots(id),
      cv_submission_id INTEGER REFERENCES cv_submissions(id),
      candidate_id INTEGER REFERENCES candidates(id),
      booking_token UUID DEFAULT gen_random_uuid() UNIQUE,
      scheduling_token UUID DEFAULT gen_random_uuid() UNIQUE,
      status VARCHAR(30) DEFAULT 'confirmed',
      booked_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await testPool.end();
};
