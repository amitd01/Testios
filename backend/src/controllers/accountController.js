const Account = require('../models/Account');

const accountController = {
  async list(req, res) {
    try {
      const includeHidden = req.query.includeHidden === 'true';
      const accounts = await Account.getByUser(req.userId, { includeHidden });
      res.json({
        accounts: accounts.map(a => ({
          id: a.id,
          institution: a.institution_name,
          type: a.account_type,
          instrumentType: a.instrument_type,
          last4: a.account_number_last4,
          balance: parseFloat(a.balance) || 0,
          creditLimit: parseFloat(a.credit_limit) || null,
          utilization: a.credit_limit ? Math.round((Math.abs(a.balance || 0) / a.credit_limit) * 100) : null,
          lastStatementDate: a.last_statement_date,
          hidden: a.hidden || false,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch accounts' });
    }
  },

  async update(req, res) {
    try {
      const { hidden } = req.body;
      if (hidden === undefined) return res.status(400).json({ error: 'Nothing to update' });
      const account = await Account.updateHidden(req.params.id, req.userId, hidden);
      if (!account) return res.status(404).json({ error: 'Account not found' });
      res.json({ account: { id: account.id, hidden: account.hidden } });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update account' });
    }
  },

  async getTransactions(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0, startDate, endDate } = req.query;

      // Verify account belongs to user
      const account = await Account.getById(id);
      if (!account || account.user_id !== req.userId) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const [transactions, count] = await Promise.all([
        Account.getTransactions(id, {
          limit: parseInt(limit),
          offset: parseInt(offset),
          startDate,
          endDate,
        }),
        Account.getTransactionCount(id),
      ]);

      res.json({
        account: {
          id: account.id,
          institution: account.institution_name,
          type: account.account_type,
          instrumentType: account.instrument_type,
          last4: account.account_number_last4,
          balance: parseFloat(account.balance) || 0,
        },
        transactions,
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch account transactions' });
    }
  },

  async netWorth(req, res) {
    try {
      const data = await Account.getNetWorth(req.userId);
      res.json({
        bankBalance: parseFloat(data?.bank_balance) || 0,
        ccOutstanding: Math.abs(parseFloat(data?.cc_outstanding) || 0),
        ccLimit: parseFloat(data?.cc_limit) || 0,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to calculate net worth' });
    }
  },
};

module.exports = accountController;
