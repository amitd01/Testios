const Transaction = require('../models/Transaction');
const { getAllCategories } = require('../services/categorizationEngine');

const transactionController = {
  /**
   * GET /api/transactions
   */
  async list(req, res) {
    try {
      const { limit = 50, offset = 0, category, startDate, endDate, search, accountLast4 } = req.query;
      const transactions = await Transaction.getByUser(req.userId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        category,
        startDate,
        endDate,
        search,
        accountLast4,
      });
      const total = await Transaction.getCount(req.userId);
      res.json({
        transactions: transactions.map(formatTransaction),
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (err) {
      console.error('Transaction list error:', err);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  },

  /**
   * GET /api/transactions/spending
   */
  async spending(req, res) {
    try {
      const { month } = req.query;
      const targetMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
      const spending = await Transaction.getMonthlySpending(req.userId, targetMonth);
      res.json({ month: targetMonth, categories: spending });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch spending data' });
    }
  },

  /**
   * GET /api/transactions/categories
   */
  async categories(req, res) {
    res.json({ categories: getAllCategories() });
  },
};

function formatTransaction(t) {
  return {
    id: t.id,
    amount: parseFloat(t.amount),
    date: t.date,
    merchant: t.merchant,
    merchantDetail: t.merchant_detail,
    category: t.category,
    accountLast4: t.account_last4,
    accountType: t.account_type,
    type: t.transaction_type,
    sources: t.sources,
    verified: t.verified,
    trustScore: t.trust_score,
  };
}

module.exports = transactionController;
