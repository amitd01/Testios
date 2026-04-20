const AnalyticsService = require('../services/analyticsService');

exports.timeToHire = async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const data = await AnalyticsService.getTimeToHireTrend(months);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.consultantComparison = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await AnalyticsService.getConsultantComparison(limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.stageDropoff = async (req, res) => {
  try {
    const requisitionId = req.query.requisition_id || null;
    const data = await AnalyticsService.getStageDropoff(requisitionId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.briefingEffectiveness = async (req, res) => {
  try {
    const data = await AnalyticsService.getBriefingEffectiveness();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.roleFamilyBreakdown = async (req, res) => {
  try {
    const data = await AnalyticsService.getRoleFamilyBreakdown();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
