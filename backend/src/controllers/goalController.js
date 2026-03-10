const Goal = require('../models/Goal');

const goalController = {
  async list(req, res) {
    try {
      const goals = await Goal.getByUser(req.userId);
      res.json({
        goals: goals.map(g => ({
          id: g.id,
          name: g.goal_name,
          type: g.goal_type,
          targetAmount: parseFloat(g.target_amount),
          currentAmount: parseFloat(g.current_amount),
          deadline: g.deadline,
          progress: g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch goals' });
    }
  },

  async create(req, res) {
    try {
      const { goalName, goalType, targetAmount, currentAmount, deadline } = req.body;
      if (!goalName || !targetAmount) {
        return res.status(400).json({ error: 'goalName and targetAmount are required' });
      }
      const goal = await Goal.create({
        user_id: req.userId,
        goal_name: goalName,
        goal_type: goalType,
        target_amount: targetAmount,
        current_amount: currentAmount || 0,
        deadline,
      });
      res.status(201).json({ goal });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create goal' });
    }
  },

  async update(req, res) {
    try {
      const goal = await Goal.update(req.params.id, {
        goal_name: req.body.goalName,
        goal_type: req.body.goalType,
        target_amount: req.body.targetAmount,
        current_amount: req.body.currentAmount,
        deadline: req.body.deadline,
      });
      if (!goal) return res.status(404).json({ error: 'Goal not found' });
      res.json({ goal });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update goal' });
    }
  },

  async delete(req, res) {
    try {
      await Goal.delete(req.params.id);
      res.json({ message: 'Goal deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete goal' });
    }
  },
};

module.exports = goalController;
