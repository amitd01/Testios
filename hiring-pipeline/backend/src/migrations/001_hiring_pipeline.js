const pool = require('../config/database');

async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_families (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

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
      consultant_id INTEGER REFERENCES consultants(id) ON DELETE CASCADE,
      role_family_id INTEGER REFERENCES role_families(id) ON DELETE CASCADE,
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
      compensation_range VARCHAR(200),
      team_info TEXT,
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
      created_at TIMESTAMP DEFAULT NOW(),
      filled_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requisition_consultants (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER REFERENCES requisitions(id) ON DELETE CASCADE,
      consultant_id INTEGER REFERENCES consultants(id) ON DELETE CASCADE,
      computed_rank INTEGER,
      assigned_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(requisition_id, consultant_id)
    );
    CREATE INDEX IF NOT EXISTS idx_req_consultants_req ON requisition_consultants(requisition_id);

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
      requisition_id INTEGER REFERENCES requisitions(id) ON DELETE CASCADE,
      candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
      consultant_id INTEGER REFERENCES consultants(id),
      cv_file_path VARCHAR(500),
      consultant_rationale TEXT,
      status VARCHAR(30) DEFAULT 'submitted'
        CHECK (status IN ('submitted','screened','shortlisted','sent_to_manager','interview_scheduled','hired','rejected')),
      submitted_at TIMESTAMP DEFAULT NOW(),
      screened_at TIMESTAMP,
      shortlisted_at TIMESTAMP,
      sent_to_manager_at TIMESTAMP,
      interview_scheduled_at TIMESTAMP,
      resolved_at TIMESTAMP,
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cv_sub_req_status ON cv_submissions(requisition_id, status);
    CREATE INDEX IF NOT EXISTS idx_cv_sub_consultant ON cv_submissions(consultant_id);

    CREATE TABLE IF NOT EXISTS briefings (
      id SERIAL PRIMARY KEY,
      cv_submission_id INTEGER REFERENCES cv_submissions(id) ON DELETE CASCADE,
      candidate_id INTEGER REFERENCES candidates(id),
      requisition_id INTEGER REFERENCES requisitions(id),
      status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending','in_progress','completed','failed')),
      transcript JSONB DEFAULT '[]'::jsonb,
      summary TEXT,
      link_token UUID DEFAULT gen_random_uuid() UNIQUE,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_briefing_token ON briefings(link_token);

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
    CREATE INDEX IF NOT EXISTS idx_outcomes_consultant_role ON hiring_outcomes(consultant_id, role_family_id);

    -- Seed default role families
    INSERT INTO role_families (name, description) VALUES
      ('Engineering', 'Software engineering and technical roles'),
      ('Sales', 'Sales, business development, and account management'),
      ('Product', 'Product management and design'),
      ('Operations', 'Operations, logistics, and supply chain'),
      ('Finance', 'Finance, accounting, and audit'),
      ('Marketing', 'Marketing, communications, and brand'),
      ('HR', 'Human resources and talent'),
      ('Leadership', 'C-suite and senior management')
    ON CONFLICT (name) DO NOTHING;
  `);

  console.log('Migration 001_hiring_pipeline: UP completed');
}

async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS hiring_outcomes CASCADE;
    DROP TABLE IF EXISTS briefings CASCADE;
    DROP TABLE IF EXISTS cv_submissions CASCADE;
    DROP TABLE IF EXISTS candidates CASCADE;
    DROP TABLE IF EXISTS requisition_consultants CASCADE;
    DROP TABLE IF EXISTS requisitions CASCADE;
    DROP TABLE IF EXISTS consultant_specialties CASCADE;
    DROP TABLE IF EXISTS consultants CASCADE;
    DROP TABLE IF EXISTS role_families CASCADE;
  `);
  console.log('Migration 001_hiring_pipeline: DOWN completed');
}

module.exports = { up, down };
