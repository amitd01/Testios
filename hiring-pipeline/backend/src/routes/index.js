const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const consultantCtrl = require('../controllers/consultantController');
const requisitionCtrl = require('../controllers/requisitionController');
const cvCtrl = require('../controllers/cvController');
const briefingCtrl = require('../controllers/briefingController');

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
router.patch('/cv-submissions/:id/advance', auth, cvCtrl.advance);
router.patch('/cv-submissions/:id/reject', auth, cvCtrl.reject);

// --- Briefings (auth required for admin) ---
router.post('/briefings', auth, briefingCtrl.create);
router.get('/briefings/:id', auth, briefingCtrl.getById);

// --- Briefings (public - candidate access via token) ---
router.get('/briefings/by-token/:token', briefingCtrl.getByToken);
router.post('/briefings/:token/chat', briefingCtrl.chat);
router.post('/briefings/:token/complete', briefingCtrl.complete);

module.exports = router;
