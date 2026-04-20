const pool = require('../config/database');

exports.up = async () => {
  await pool.query(`
    ALTER TABLE cv_submissions ADD COLUMN IF NOT EXISTS fit_score INTEGER;
    ALTER TABLE cv_submissions ADD COLUMN IF NOT EXISTS fit_analysis JSONB;
    ALTER TABLE cv_submissions ADD COLUMN IF NOT EXISTS scored_at TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_cv_sub_fit_score ON cv_submissions(fit_score);
  `);
};

exports.down = async () => {
  await pool.query(`
    DROP INDEX IF EXISTS idx_cv_sub_fit_score;
    ALTER TABLE cv_submissions DROP COLUMN IF EXISTS scored_at;
    ALTER TABLE cv_submissions DROP COLUMN IF EXISTS fit_analysis;
    ALTER TABLE cv_submissions DROP COLUMN IF EXISTS fit_score;
  `);
};
