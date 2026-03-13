const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const consultantCtrl = require('../controllers/consultantController');
const requisitionCtrl = require('../controllers/requisitionController');
const cvCtrl = require('../controllers/cvController');
const briefingCtrl = require('../controllers/briefingController');
const interviewCtrl = require('../controllers/interviewController');
const analyticsCtrl = require('../controllers/analyticsController');

// --- Role Families ---
router.get('/role-families', auth, consultantCtrl.listRoleFamilies);
router.post('/role-families', auth, consultantCtrl.createRoleFamily);

// --- Consultants ---
router.get('/consultants', auth, consultantCtrl.listConsultants);
router.post('/consultants', auth, consultantCtrl.createConsultant);
router.patch('/consultants/:id', auth, consultantCtrl.updateConsultant);
router.get('/consultants/:id/rankings', auth, consultantCtrl.getConsultantRankings);
router.get('/consultants/rankings-by-role/:roleFamilyId', auth, consultantCtrl.getRankingsByRole);

// --- Requisitions ---
router.get('/requisitions', auth, requisitionCtrl.list);
router.post('/requisitions', auth, requisitionCtrl.create);
router.get('/requisitions/:id', auth, requisitionCtrl.getById);
router.patch('/requisitions/:id', auth, requisitionCtrl.update);
router.get('/requisitions/:id/suggest-consultants', auth, requisitionCtrl.suggestConsultants);
router.post('/requisitions/:id/assign-consultants', auth, requisitionCtrl.assignConsultants);

// --- CV Submissions ---
router.post('/cv-submissions', auth, cvCtrl.submit);
router.get('/cv-submissions', auth, cvCtrl.list);
router.get('/cv-submissions/dashboard', auth, cvCtrl.dashboard);
router.get('/cv-submissions/aging', auth, cvCtrl.aging);
router.get('/cv-submissions/:id', auth, cvCtrl.getById);
router.get('/cv-submissions/:id/score', auth, cvCtrl.getScore);
router.patch('/cv-submissions/:id/advance', auth, cvCtrl.advance);
router.patch('/cv-submissions/:id/reject', auth, cvCtrl.reject);

// --- Briefings (auth required for admin) ---
router.post('/briefings', auth, briefingCtrl.create);
router.get('/briefings/:id', auth, briefingCtrl.getById);

// --- Briefings (public - candidate access via token) ---
router.get('/briefings/by-token/:token', briefingCtrl.getByToken);
router.post('/briefings/:token/chat', briefingCtrl.chat);
router.post('/briefings/:token/complete', briefingCtrl.complete);

// --- Interview Slots (auth required) ---
router.post('/interview-slots', auth, interviewCtrl.createSlot);
router.post('/interview-slots/bulk', auth, interviewCtrl.createSlotsBulk);
router.get('/interview-slots', auth, interviewCtrl.listSlots);

// --- Interview Bookings (auth required) ---
router.get('/interviews', auth, interviewCtrl.listBookings);
router.patch('/interviews/:id/cancel', auth, interviewCtrl.cancelBooking);
router.patch('/interviews/:id/complete', auth, interviewCtrl.completeBooking);
router.post('/interviews/create-link', auth, interviewCtrl.createSchedulingLink);

// --- Interview Scheduling (public - candidate access via token) ---
router.get('/interviews/schedule/:token', interviewCtrl.getScheduleByToken);
router.post('/interviews/schedule/:token/book', interviewCtrl.bookSlot);

// --- Analytics ---
router.get('/analytics/time-to-hire', auth, analyticsCtrl.timeToHire);
router.get('/analytics/consultant-comparison', auth, analyticsCtrl.consultantComparison);
router.get('/analytics/stage-dropoff', auth, analyticsCtrl.stageDropoff);
router.get('/analytics/briefing-effectiveness', auth, analyticsCtrl.briefingEffectiveness);
router.get('/analytics/role-family-breakdown', auth, analyticsCtrl.roleFamilyBreakdown);

module.exports = router;
