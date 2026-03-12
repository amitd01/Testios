const pool = require('../config/database');

const VALID_TRANSITIONS = {
  submitted: ['screened', 'rejected'],
  screened: ['shortlisted', 'rejected'],
  shortlisted: ['sent_to_manager', 'rejected'],
  sent_to_manager: ['interview_scheduled', 'rejected'],
  interview_scheduled: ['hired', 'rejected'],
};

const TIMESTAMP_MAP = {
  screened: 'screened_at',
  shortlisted: 'shortlisted_at',
  sent_to_manager: 'sent_to_manager_at',
  interview_scheduled: 'interview_scheduled_at',
  hired: 'resolved_at',
  rejected: 'resolved_at',
};

class CvSubmission {
  static async findAll({ requisition_id, consultant_id, status } = {}) {
    let query = `
      SELECT cv.*, c.name as candidate_name, c.email as candidate_email,
        con.firm_name as consultant_firm,
        b.status as briefing_status, b.link_token as briefing_token
      FROM cv_submissions cv
      JOIN candidates c ON cv.candidate_id = c.id
      LEFT JOIN consultants con ON cv.consultant_id = con.id
      LEFT JOIN briefings b ON b.cv_submission_id = cv.id
    `;
    const conditions = [];
    const params = [];

    if (requisition_id) { params.push(requisition_id); conditions.push(`cv.requisition_id = $${params.length}`); }
    if (consultant_id) { params.push(consultant_id); conditions.push(`cv.consultant_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`cv.status = $${params.length}`); }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY cv.submitted_at DESC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async findById(id) {
    const { rows } = await pool.query(`
      SELECT cv.*, c.name as candidate_name, c.email as candidate_email,
        con.firm_name as consultant_firm,
        b.status as briefing_status, b.link_token as briefing_token, b.id as briefing_id
      FROM cv_submissions cv
      JOIN candidates c ON cv.candidate_id = c.id
      LEFT JOIN consultants con ON cv.consultant_id = con.id
      LEFT JOIN briefings b ON b.cv_submission_id = cv.id
      WHERE cv.id = $1
    `, [id]);
    return rows[0] || null;
  }

  static async create({ requisition_id, candidate_id, consultant_id, cv_file_path, consultant_rationale }) {
    const { rows } = await pool.query(
      `INSERT INTO cv_submissions (requisition_id, candidate_id, consultant_id, cv_file_path, consultant_rationale)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [requisition_id, candidate_id, consultant_id, cv_file_path, consultant_rationale]
    );
    return rows[0];
  }

  static async advance(id, { briefingRequired = true } = {}) {
    const submission = await this.findById(id);
    if (!submission) throw new Error('CV submission not found');

    const currentStatus = submission.status;
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed) throw new Error(`Cannot advance from terminal status: ${currentStatus}`);

    const nextStatus = allowed[0]; // First option is the forward move

    // Gate: briefing must be completed before scheduling interview
    if (nextStatus === 'interview_scheduled' && briefingRequired) {
      if (!submission.briefing_status || submission.briefing_status !== 'completed') {
        throw new Error('Candidate must complete pre-interview briefing before scheduling interview');
      }
    }

    const tsCol = TIMESTAMP_MAP[nextStatus];
    const { rows } = await pool.query(
      `UPDATE cv_submissions SET status = $2, ${tsCol} = NOW() WHERE id = $1 RETURNING *`,
      [id, nextStatus]
    );
    return rows[0];
  }

  static async reject(id, reason) {
    const submission = await this.findById(id);
    if (!submission) throw new Error('CV submission not found');
    if (submission.status === 'hired' || submission.status === 'rejected') {
      throw new Error(`Cannot reject from terminal status: ${submission.status}`);
    }

    const { rows } = await pool.query(
      `UPDATE cv_submissions SET status = 'rejected', rejection_reason = $2, resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [id, reason]
    );
    return rows[0];
  }

  static async getDashboard() {
    const { rows } = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - submitted_at)) / 86400)::numeric(10,1) as avg_days
      FROM cv_submissions
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'submitted' THEN 1 WHEN 'screened' THEN 2 WHEN 'shortlisted' THEN 3
          WHEN 'sent_to_manager' THEN 4 WHEN 'interview_scheduled' THEN 5
          WHEN 'hired' THEN 6 WHEN 'rejected' THEN 7
        END
    `);
    return rows;
  }

  static async getAging(thresholdDays = 3) {
    const { rows } = await pool.query(`
      SELECT cv.*, c.name as candidate_name, con.firm_name as consultant_firm,
        EXTRACT(EPOCH FROM (NOW() -
          CASE cv.status
            WHEN 'submitted' THEN cv.submitted_at
            WHEN 'screened' THEN cv.screened_at
            WHEN 'shortlisted' THEN cv.shortlisted_at
            WHEN 'sent_to_manager' THEN cv.sent_to_manager_at
            WHEN 'interview_scheduled' THEN cv.interview_scheduled_at
          END
        )) / 86400 as days_in_stage
      FROM cv_submissions cv
      JOIN candidates c ON cv.candidate_id = c.id
      LEFT JOIN consultants con ON cv.consultant_id = con.id
      WHERE cv.status NOT IN ('hired', 'rejected')
        AND EXTRACT(EPOCH FROM (NOW() -
          CASE cv.status
            WHEN 'submitted' THEN cv.submitted_at
            WHEN 'screened' THEN cv.screened_at
            WHEN 'shortlisted' THEN cv.shortlisted_at
            WHEN 'sent_to_manager' THEN cv.sent_to_manager_at
            WHEN 'interview_scheduled' THEN cv.interview_scheduled_at
          END
        )) / 86400 > $1
      ORDER BY days_in_stage DESC
    `, [thresholdDays]);
    return rows;
  }
}

module.exports = CvSubmission;
