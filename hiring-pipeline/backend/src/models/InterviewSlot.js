const pool = require('../config/database');

class InterviewSlot {
  static async findByRequisition(requisitionId) {
    const { rows } = await pool.query(`
      SELECT s.*,
        ib.id as booking_id, ib.status as booking_status,
        ib.cv_submission_id, ib.scheduling_token,
        c.name as candidate_name, c.email as candidate_email
      FROM interview_slots s
      LEFT JOIN interview_bookings ib ON ib.slot_id = s.id AND ib.status != 'cancelled'
      LEFT JOIN candidates c ON ib.candidate_id = c.id
      WHERE s.requisition_id = $1
      ORDER BY s.start_time
    `, [requisitionId]);
    return rows;
  }

  static async findAvailable(requisitionId) {
    const { rows } = await pool.query(`
      SELECT * FROM interview_slots
      WHERE requisition_id = $1
        AND is_booked = false
        AND start_time > NOW()
      ORDER BY start_time
    `, [requisitionId]);
    return rows;
  }

  static async create({ requisition_id, interviewer_name, interviewer_email, start_time, end_time, duration_minutes }) {
    const { rows } = await pool.query(
      `INSERT INTO interview_slots (requisition_id, interviewer_name, interviewer_email, start_time, end_time, duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [requisition_id, interviewer_name, interviewer_email, start_time, end_time, duration_minutes || 60]
    );
    return rows[0];
  }

  static async createBulk(requisitionId, slots) {
    const results = [];
    for (const slot of slots) {
      const created = await this.create({
        requisition_id: requisitionId,
        interviewer_name: slot.interviewer_name,
        interviewer_email: slot.interviewer_email,
        start_time: slot.start_time,
        end_time: slot.end_time,
        duration_minutes: slot.duration_minutes,
      });
      results.push(created);
    }
    return results;
  }

  static async markBooked(id) {
    const { rows } = await pool.query(
      'UPDATE interview_slots SET is_booked = true WHERE id = $1 RETURNING *',
      [id]
    );
    return rows[0];
  }

  static async markAvailable(id) {
    const { rows } = await pool.query(
      'UPDATE interview_slots SET is_booked = false WHERE id = $1 RETURNING *',
      [id]
    );
    return rows[0];
  }

  static async findById(id) {
    const { rows } = await pool.query('SELECT * FROM interview_slots WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

module.exports = InterviewSlot;
