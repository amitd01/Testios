const Budget = require('../models/Budget');
const { getAllCategories } = require('../services/categorizationEngine');

const budgetController = {
  async list(req, res) {
    try {
      const { month } = req.query;
      const targetMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
      const budgets = await Budget.getByUser(req.userId, targetMonth);
      res.json({
        month: targetMonth,
        budgets: budgets.map(b => ({
          id: b.id,
          category: b.category,
          limit: parseFloat(b.monthly_limit),
          spent: parseFloat(b.current_spent),
          remaining: parseFloat(b.monthly_limit) - parseFloat(b.current_spent),
          progress: b.monthly_limit > 0 ? Math.round((b.current_spent / b.monthly_limit) * 100) : 0,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch budgets' });
    }
  },

  async upsert(req, res) {
    try {
      const { category, monthlyLimit, month } = req.body;
      if (!category || !monthlyLimit) {
        return res.status(400).json({ error: 'category and monthlyLimit are required' });
      }
      const targetMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
      const budget = await Budget.upsert({
        userId: req.userId,
        category,
        monthlyLimit,
        month: targetMonth,
      });
      res.json({ budget });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save budget' });
    }
  },

  async applyTemplate(req, res) {
    try {
      const { template, monthlyIncome } = req.body;
      if (!monthlyIncome) return res.status(400).json({ error: 'monthlyIncome is required' });

      const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
      let allocations = {};

      switch (template) {
        case '50/30/20':
          allocations = {
            'Bills & Utilities': monthlyIncome * 0.15,
            'Rent': monthlyIncome * 0.15,
            'Food & Dining': monthlyIncome * 0.10,
            'Transportation': monthlyIncome * 0.10,
            'Shopping': monthlyIncome * 0.10,
            'Entertainment': monthlyIncome * 0.10,
            'Personal Care': monthlyIncome * 0.10,
            'Investments': monthlyIncome * 0.20,
          };
          break;
        case 'zero-based':
          const categories = getAllCategories();
          const perCategory = monthlyIncome / categories.length;
          for (const cat of categories) {
            allocations[cat] = Math.round(perCategory);
          }
          break;
        default:
          return res.status(400).json({ error: 'Invalid template. Use: 50/30/20, zero-based' });
      }

      const budgets = [];
      for (const [category, limit] of Object.entries(allocations)) {
        const b = await Budget.upsert({ userId: req.userId, category, monthlyLimit: limit, month });
        budgets.push(b);
      }
      res.json({ budgets });
    } catch (err) {
      res.status(500).json({ error: 'Failed to apply budget template' });
    }
  },

  async delete(req, res) {
    try {
      await Budget.delete(req.params.id);
      res.json({ message: 'Budget deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete budget' });
    }
  },
};

module.exports = budgetController;
