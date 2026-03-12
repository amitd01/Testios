const Requisition = require('../models/Requisition');
const YieldCalculator = require('../services/yieldCalculator');

exports.list = async (req, res) => {
  try {
    const requisitions = await Requisition.findAll({ status: req.query.status });
    res.json(requisitions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { title, role_family_id } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const requisition = await Requisition.create(req.body);
    res.status(201).json(requisition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const requisition = await Requisition.findById(req.params.id);
    if (!requisition) return res.status(404).json({ error: 'Requisition not found' });

    const consultants = await Requisition.getAssignedConsultants(req.params.id);
    res.json({ ...requisition, assigned_consultants: consultants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const requisition = await Requisition.update(req.params.id, req.body);
    if (!requisition) return res.status(404).json({ error: 'Requisition not found' });
    res.json(requisition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.suggestConsultants = async (req, res) => {
  try {
    const suggestions = await YieldCalculator.suggestConsultants(req.params.id);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.assignConsultants = async (req, res) => {
  try {
    const { consultant_ids } = req.body;
    if (!consultant_ids || !Array.isArray(consultant_ids)) {
      return res.status(400).json({ error: 'consultant_ids array is required' });
    }

    const assignments = [];
    for (let i = 0; i < consultant_ids.length; i++) {
      const assignment = await Requisition.assignConsultant(req.params.id, consultant_ids[i], i + 1);
      assignments.push(assignment);
    }

    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
