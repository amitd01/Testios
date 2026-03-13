const CvSubmission = require('../models/CvSubmission');
const Candidate = require('../models/Candidate');
const YieldCalculator = require('../services/yieldCalculator');
const TriageService = require('../services/triageService');

exports.submit = async (req, res) => {
  try {
    const { requisition_id, candidate_name, candidate_email, candidate_phone, consultant_id, cv_file_path, consultant_rationale } = req.body;
    if (!requisition_id || !candidate_name) {
      return res.status(400).json({ error: 'requisition_id and candidate_name are required' });
    }

    const candidate = await Candidate.findOrCreate({
      name: candidate_name,
      email: candidate_email,
      phone: candidate_phone,
      source_consultant_id: consultant_id,
    });

    const submission = await CvSubmission.create({
      requisition_id,
      candidate_id: candidate.id,
      consultant_id,
      cv_file_path,
      consultant_rationale,
    });

    // Record outcome for yield tracking
    const pool = require('../config/database');
    const reqResult = await pool.query('SELECT role_family_id FROM requisitions WHERE id = $1', [requisition_id]);
    if (reqResult.rows[0]?.role_family_id) {
      await YieldCalculator.recordOutcome({
        requisition_id,
        consultant_id,
        role_family_id: reqResult.rows[0].role_family_id,
        candidate_id: candidate.id,
        submitted: true,
        interviewed: false,
        offered: false,
        accepted: false,
      });
    }

    // Auto-score the submission
    try {
      const reqRow = await pool.query('SELECT * FROM requisitions WHERE id = $1', [requisition_id]);
      if (reqRow.rows[0]) {
        const scoreResult = await TriageService.score(
          { ...submission, candidate_name, consultant_rationale },
          reqRow.rows[0]
        );
        await CvSubmission.updateScore(submission.id, {
          fit_score: scoreResult.fit_score,
          fit_analysis: { dimensions: scoreResult.dimensions, summary: scoreResult.summary, method: scoreResult.method },
        });
        submission.fit_score = scoreResult.fit_score;
        submission.fit_analysis = scoreResult;
      }
    } catch (scoreErr) {
      // Scoring failure should not block submission
    }

    res.status(201).json(submission);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getScore = async (req, res) => {
  try {
    const submission = await CvSubmission.findById(req.params.id);
    if (!submission) return res.status(404).json({ error: 'CV submission not found' });
    res.json({
      id: submission.id,
      candidate_name: submission.candidate_name,
      fit_score: submission.fit_score,
      fit_analysis: submission.fit_analysis,
      scored_at: submission.scored_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const submissions = await CvSubmission.findAll(req.query);
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const submission = await CvSubmission.findById(req.params.id);
    if (!submission) return res.status(404).json({ error: 'CV submission not found' });
    res.json(submission);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.advance = async (req, res) => {
  try {
    const submission = await CvSubmission.advance(req.params.id);
    res.json(submission);
  } catch (err) {
    if (err.message.includes('briefing') || err.message.includes('Cannot advance')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.reject = async (req, res) => {
  try {
    const { reason } = req.body;
    const submission = await CvSubmission.reject(req.params.id, reason);
    res.json(submission);
  } catch (err) {
    if (err.message.includes('Cannot reject')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const stats = await CvSubmission.getDashboard();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.aging = async (req, res) => {
  try {
    const threshold = parseInt(req.query.days) || 3;
    const aging = await CvSubmission.getAging(threshold);
    res.json(aging);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
