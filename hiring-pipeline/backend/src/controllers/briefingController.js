const Briefing = require('../models/Briefing');
const CvSubmission = require('../models/CvSubmission');
const BriefingChatService = require('../services/briefingChatService');

exports.create = async (req, res) => {
  try {
    const { cv_submission_id } = req.body;
    if (!cv_submission_id) return res.status(400).json({ error: 'cv_submission_id is required' });

    const submission = await CvSubmission.findById(cv_submission_id);
    if (!submission) return res.status(404).json({ error: 'CV submission not found' });

    const briefing = await Briefing.create({
      cv_submission_id,
      candidate_id: submission.candidate_id,
      requisition_id: submission.requisition_id,
    });

    res.status(201).json(briefing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const briefing = await Briefing.findById(req.params.id);
    if (!briefing) return res.status(404).json({ error: 'Briefing not found' });
    res.json(briefing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Public endpoint - no auth required
exports.getByToken = async (req, res) => {
  try {
    const briefing = await Briefing.findByToken(req.params.token);
    if (!briefing) return res.status(404).json({ error: 'Briefing not found' });

    // Return limited info for candidate view
    res.json({
      id: briefing.id,
      status: briefing.status,
      requisition_title: briefing.requisition_title,
      candidate_name: briefing.candidate_name,
      transcript: briefing.transcript,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Public endpoint - candidate chats
exports.chat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const briefing = await Briefing.findByToken(req.params.token);
    if (!briefing) return res.status(404).json({ error: 'Briefing not found' });

    const response = await BriefingChatService.chat(briefing.id, message);
    res.json({ response });
  } catch (err) {
    if (err.message.includes('concluded') || err.message.includes('not configured')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

// Public endpoint - candidate marks briefing complete
exports.complete = async (req, res) => {
  try {
    const briefing = await Briefing.findByToken(req.params.token);
    if (!briefing) return res.status(404).json({ error: 'Briefing not found' });

    const result = await BriefingChatService.evaluate(briefing.id);
    res.json({
      status: result.status,
      summary: result.summary,
      passed: result.status === 'completed',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
