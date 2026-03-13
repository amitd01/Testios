const InterviewSlot = require('../models/InterviewSlot');
const InterviewBooking = require('../models/InterviewBooking');

// --- Authenticated endpoints ---

async function createSlot(req, res) {
  try {
    const { requisition_id, interviewer_name, interviewer_email, start_time, end_time, duration_minutes } = req.body;
    if (!requisition_id || !interviewer_name || !start_time || !end_time) {
      return res.status(400).json({ error: 'requisition_id, interviewer_name, start_time, and end_time are required' });
    }
    const slot = await InterviewSlot.create({ requisition_id, interviewer_name, interviewer_email, start_time, end_time, duration_minutes });
    res.status(201).json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createSlotsBulk(req, res) {
  try {
    const { requisition_id, slots } = req.body;
    if (!requisition_id || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'requisition_id and non-empty slots array required' });
    }
    const created = await InterviewSlot.createBulk(requisition_id, slots);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listSlots(req, res) {
  try {
    const { requisition_id } = req.query;
    if (!requisition_id) return res.status(400).json({ error: 'requisition_id query param required' });
    const slots = await InterviewSlot.findByRequisition(parseInt(requisition_id));
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listBookings(req, res) {
  try {
    const { requisition_id } = req.query;
    if (!requisition_id) return res.status(400).json({ error: 'requisition_id query param required' });
    const bookings = await InterviewBooking.findByRequisition(parseInt(requisition_id));
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function cancelBooking(req, res) {
  try {
    const booking = await InterviewBooking.cancel(parseInt(req.params.id));
    res.json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function completeBooking(req, res) {
  try {
    const booking = await InterviewBooking.complete(parseInt(req.params.id));
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createSchedulingLink(req, res) {
  try {
    const { cv_submission_id } = req.body;
    if (!cv_submission_id) return res.status(400).json({ error: 'cv_submission_id required' });
    const booking = await InterviewBooking.createSchedulingLink(cv_submission_id);
    res.status(201).json({
      scheduling_token: booking.scheduling_token,
      scheduling_url: `/interview/${booking.scheduling_token}`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// --- Public endpoints (no auth) ---

async function getScheduleByToken(req, res) {
  try {
    const booking = await InterviewBooking.findBySchedulingToken(req.params.token);
    if (!booking) return res.status(404).json({ error: 'Scheduling link not found or expired' });

    // If already booked, return the booking details
    if (booking.slot_id) {
      return res.json({
        status: 'booked',
        booking: {
          candidate_name: booking.candidate_name,
          requisition_title: booking.requisition_title,
          interviewer_name: booking.interviewer_name,
          start_time: booking.start_time,
          end_time: booking.end_time,
          booked_at: booking.booked_at,
        },
      });
    }

    // Not yet booked — return available slots
    const { rows: cvRows } = require('../config/database').query ?
      await require('../config/database').query(
        'SELECT requisition_id FROM cv_submissions WHERE id = $1', [booking.cv_submission_id]
      ) : { rows: [] };

    const requisitionId = cvRows[0]?.requisition_id || booking.requisition_id;
    const availableSlots = await InterviewSlot.findAvailable(requisitionId);

    res.json({
      status: 'pending',
      candidate_name: booking.candidate_name,
      requisition_title: booking.requisition_title,
      requisition_description: booking.requisition_description,
      available_slots: availableSlots,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function bookSlot(req, res) {
  try {
    const { slot_id } = req.body;
    if (!slot_id) return res.status(400).json({ error: 'slot_id required' });
    const booking = await InterviewBooking.book(req.params.token, parseInt(slot_id));

    // Fetch the full booking details to return
    const full = await InterviewBooking.findBySchedulingToken(req.params.token);
    res.json({
      message: 'Interview booked successfully',
      booking: {
        id: full.id,
        candidate_name: full.candidate_name,
        requisition_title: full.requisition_title,
        interviewer_name: full.interviewer_name,
        start_time: full.start_time,
        end_time: full.end_time,
        booked_at: full.booked_at,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  createSlot,
  createSlotsBulk,
  listSlots,
  listBookings,
  cancelBooking,
  completeBooking,
  createSchedulingLink,
  getScheduleByToken,
  bookSlot,
};
