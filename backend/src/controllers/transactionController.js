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

  /**
   * GET /api/transactions/:id
   */
  async getById(req, res) {
    try {
      const txn = await Transaction.getById(req.params.id, req.userId);
      if (!txn) return res.status(404).json({ error: 'Transaction not found' });
      res.json({ transaction: formatTransaction(txn) });
    } catch (err) {
      console.error('Transaction getById error:', err);
      res.status(500).json({ error: 'Failed to fetch transaction' });
    }
  },

  /**
   * PATCH /api/transactions/:id - Update user overrides (merchant, category, notes)
   */
  async update(req, res) {
    try {
      const { merchant, category, notes } = req.body;
      const txn = await Transaction.updateUserOverrides(req.params.id, req.userId, { merchant, category, notes });
      if (!txn) return res.status(404).json({ error: 'Transaction not found' });
      res.json({ transaction: formatTransaction(txn) });
    } catch (err) {
      console.error('Transaction update error:', err);
      res.status(500).json({ error: 'Failed to update transaction' });
    }
  },

  /**
   * GET /api/transactions/export - Export as CSV
   */
  async exportCsv(req, res) {
    try {
      const transactions = await Transaction.getByUser(req.userId, { limit: 100000 });
      const headers = 'Date,Merchant,Category,Amount,Account,Type,Source\n';
      const rows = transactions.map(t => {
        const merchant = (t.user_merchant_override || t.merchant || '').replace(/,/g, ' ');
        const category = t.user_category_override || t.category || '';
        const sources = (t.sources || []).join('; ');
        return `${t.date},${merchant},${category},${t.amount},${t.account_last4 || ''},${t.transaction_type},${sources}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
      res.send(headers + rows);
    } catch (err) {
      console.error('Export error:', err);
      res.status(500).json({ error: 'Failed to export transactions' });
    }
  },
};

function formatTransaction(t) {
  return {
    id: t.id,
    amount: parseFloat(t.amount),
    date: t.date,
    merchant: t.user_merchant_override || t.merchant,
    merchantOriginal: t.merchant,
    merchantDetail: t.merchant_detail,
    category: t.user_category_override || t.category,
    categoryOriginal: t.category,
    accountLast4: t.account_last4,
    accountType: t.account_type,
    instrumentType: t.instrument_type,
    financialType: t.financial_type,
    type: t.transaction_type,
    sources: t.sources,
    verified: t.verified,
    trustScore: t.trust_score,
    notes: t.user_notes,
    rawTransactionIds: t.raw_transaction_ids,
    metadata: t.metadata,
  };
}

module.exports = transactionController;
