const pool = require('../config/database');
const InterviewSlot = require('./InterviewSlot');

class InterviewBooking {
  static async findBySchedulingToken(token) {
    const { rows } = await pool.query(`
      SELECT ib.*,
        s.requisition_id, s.interviewer_name, s.interviewer_email,
        s.start_time, s.end_time, s.duration_minutes,
        c.name as candidate_name, c.email as candidate_email,
        r.title as requisition_title, r.description as requisition_description,
        r.field_expectations, r.compensation_range
      FROM interview_bookings ib
      LEFT JOIN interview_slots s ON ib.slot_id = s.id
      JOIN cv_submissions cv ON ib.cv_submission_id = cv.id
      JOIN candidates c ON ib.candidate_id = c.id
      JOIN requisitions r ON cv.requisition_id = r.id
      WHERE ib.scheduling_token = $1
    `, [token]);
    return rows[0] || null;
  }

  static async findByRequisition(requisitionId) {
    const { rows } = await pool.query(`
      SELECT ib.*,
        s.interviewer_name, s.interviewer_email, s.start_time, s.end_time,
        c.name as candidate_name, c.email as candidate_email,
        cv.status as cv_status
      FROM interview_bookings ib
      LEFT JOIN interview_slots s ON ib.slot_id = s.id
      JOIN candidates c ON ib.candidate_id = c.id
      JOIN cv_submissions cv ON ib.cv_submission_id = cv.id
      WHERE cv.requisition_id = $1
      ORDER BY s.start_time
    `, [requisitionId]);
    return rows;
  }

  static async createSchedulingLink(cvSubmissionId) {
    // Look up the CV submission to get candidate_id
    const { rows: cvRows } = await pool.query(
      'SELECT cv.*, c.name as candidate_name FROM cv_submissions cv JOIN candidates c ON cv.candidate_id = c.id WHERE cv.id = $1',
      [cvSubmissionId]
    );
    const cv = cvRows[0];
    if (!cv) throw new Error('CV submission not found');

    // Check if a scheduling link already exists for this CV
    const { rows: existing } = await pool.query(
      'SELECT * FROM interview_bookings WHERE cv_submission_id = $1 AND status != $2',
      [cvSubmissionId, 'cancelled']
    );
    if (existing.length > 0) {
      return existing[0];
    }

    // Create a booking record with no slot yet (just the scheduling token)
    const { rows } = await pool.query(
      `INSERT INTO interview_bookings (cv_submission_id, candidate_id, status)
       VALUES ($1, $2, 'confirmed')
       RETURNING *`,
      [cvSubmissionId, cv.candidate_id]
    );
    return rows[0];
  }

  static async book(schedulingToken, slotId) {
    const booking = await this.findBySchedulingToken(schedulingToken);
    if (!booking) throw new Error('Scheduling link not found');
    if (booking.slot_id) throw new Error('Interview already booked');

    const slot = await InterviewSlot.findById(slotId);
    if (!slot) throw new Error('Slot not found');
    if (slot.is_booked) throw new Error('Slot is no longer available');

    // Book the slot
    await InterviewSlot.markBooked(slotId);

    // Update the booking with the slot
    const { rows } = await pool.query(
      `UPDATE interview_bookings
       SET slot_id = $2, booked_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [booking.id, slotId]
    );

    // Auto-advance the CV submission to interview_scheduled
    const CvSubmission = require('./CvSubmission');
    try {
      const cv = await CvSubmission.findById(booking.cv_submission_id);
      if (cv && cv.status === 'sent_to_manager') {
        await CvSubmission.advance(booking.cv_submission_id, { briefingRequired: false });
      }
    } catch (err) {
      // Don't fail the booking if advance fails (CV might already be at interview_scheduled)
      console.warn('Auto-advance after booking failed:', err.message);
    }

    return rows[0];
  }

  static async cancel(id) {
    const { rows: bookingRows } = await pool.query(
      'SELECT * FROM interview_bookings WHERE id = $1', [id]
    );
    const booking = bookingRows[0];
    if (!booking) throw new Error('Booking not found');

    // Free up the slot
    if (booking.slot_id) {
      await InterviewSlot.markAvailable(booking.slot_id);
    }

    const { rows } = await pool.query(
      `UPDATE interview_bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0];
  }

  static async complete(id) {
    const { rows } = await pool.query(
      `UPDATE interview_bookings SET status = 'completed' WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const { rows } = await pool.query('SELECT * FROM interview_bookings WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

module.exports = InterviewBooking;
