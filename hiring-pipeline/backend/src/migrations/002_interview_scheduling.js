const pool = require('../config/database');

async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interview_slots (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER REFERENCES requisitions(id) ON DELETE CASCADE,
      interviewer_name VARCHAR(200) NOT NULL,
      interviewer_email VARCHAR(200),
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      is_booked BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_slots_req ON interview_slots(requisition_id);
    CREATE INDEX IF NOT EXISTS idx_slots_time ON interview_slots(start_time);

    CREATE TABLE IF NOT EXISTS interview_bookings (
      id SERIAL PRIMARY KEY,
      slot_id INTEGER REFERENCES interview_slots(id) ON DELETE CASCADE,
      cv_submission_id INTEGER REFERENCES cv_submissions(id) ON DELETE CASCADE,
      candidate_id INTEGER REFERENCES candidates(id),
      booking_token UUID DEFAULT gen_random_uuid() UNIQUE,
      scheduling_token UUID DEFAULT gen_random_uuid() UNIQUE,
      status VARCHAR(20) DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
      booked_at TIMESTAMP DEFAULT NOW(),
      cancelled_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_token ON interview_bookings(booking_token);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduling_token ON interview_bookings(scheduling_token);
    CREATE INDEX IF NOT EXISTS idx_bookings_cv ON interview_bookings(cv_submission_id);
  `);

  console.log('Migration 002_interview_scheduling: UP completed');
}

async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS interview_bookings CASCADE;
    DROP TABLE IF EXISTS interview_slots CASCADE;
  `);
  console.log('Migration 002_interview_scheduling: DOWN completed');
}

module.exports = { up, down };
