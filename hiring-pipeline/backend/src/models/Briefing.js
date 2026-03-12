const pool = require('../config/database');

class Briefing {
  static async findById(id) {
    const { rows } = await pool.query(`
      SELECT b.*, c.name as candidate_name, c.email as candidate_email,
        r.title as requisition_title, r.description as requisition_description,
        r.field_expectations, r.compensation_range, r.team_info
      FROM briefings b
      JOIN candidates c ON b.candidate_id = c.id
      JOIN requisitions r ON b.requisition_id = r.id
      WHERE b.id = $1
    `, [id]);
    return rows[0] || null;
  }

  static async findByToken(token) {
    const { rows } = await pool.query(`
      SELECT b.*, c.name as candidate_name, c.email as candidate_email,
        r.title as requisition_title, r.description as requisition_description,
        r.field_expectations, r.compensation_range, r.team_info
      FROM briefings b
      JOIN candidates c ON b.candidate_id = c.id
      JOIN requisitions r ON b.requisition_id = r.id
      WHERE b.link_token = $1
    `, [token]);
    return rows[0] || null;
  }

  static async create({ cv_submission_id, candidate_id, requisition_id }) {
    const { rows } = await pool.query(
      'INSERT INTO briefings (cv_submission_id, candidate_id, requisition_id) VALUES ($1, $2, $3) RETURNING *',
      [cv_submission_id, candidate_id, requisition_id]
    );
    return rows[0];
  }

  static async appendMessage(id, role, content) {
    const { rows } = await pool.query(`
      UPDATE briefings
      SET transcript = transcript || $2::jsonb,
          status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
          started_at = CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END
      WHERE id = $1 RETURNING *
    `, [id, JSON.stringify([{ role, content, timestamp: new Date().toISOString() }])]);
    return rows[0];
  }

  static async complete(id, { summary, passed }) {
    const status = passed ? 'completed' : 'failed';
    const { rows } = await pool.query(
      'UPDATE briefings SET status = $2, summary = $3, completed_at = NOW() WHERE id = $1 RETURNING *',
      [id, status, summary]
    );
    return rows[0];
  }
}

module.exports = Briefing;
