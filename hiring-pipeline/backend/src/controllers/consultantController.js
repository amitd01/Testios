const RoleFamily = require('../models/RoleFamily');
const Consultant = require('../models/Consultant');
const YieldCalculator = require('../services/yieldCalculator');

exports.listRoleFamilies = async (req, res) => {
  try {
    const families = await RoleFamily.findAll();
    res.json(families);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createRoleFamily = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const family = await RoleFamily.create({ name, description });
    res.status(201).json(family);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listConsultants = async (req, res) => {
  try {
    const { active, role_family_id } = req.query;
    const consultants = await Consultant.findAll({
      active: active !== undefined ? active === 'true' : undefined,
      roleFamilyId: role_family_id,
    });
    res.json(consultants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createConsultant = async (req, res) => {
  try {
    const { firm_name, contact_name, contact_email, phone, notes, specialty_ids } = req.body;
    if (!firm_name) return res.status(400).json({ error: 'firm_name is required' });
    const consultant = await Consultant.create({ firm_name, contact_name, contact_email, phone, notes, specialty_ids });
    res.status(201).json(consultant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateConsultant = async (req, res) => {
  try {
    const consultant = await Consultant.update(req.params.id, req.body);
    if (!consultant) return res.status(404).json({ error: 'Consultant not found' });
    res.json(consultant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getConsultantRankings = async (req, res) => {
  try {
    const profile = await YieldCalculator.getConsultantProfile(req.params.id);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRankingsByRole = async (req, res) => {
  try {
    const rankings = await YieldCalculator.getRankingsForRoleFamily(req.params.roleFamilyId);
    res.json(rankings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
