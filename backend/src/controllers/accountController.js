const Account = require('../models/Account');

const accountController = {
  async list(req, res) {
    try {
      const accounts = await Account.getByUser(req.userId);
      res.json({
        accounts: accounts.map(a => ({
          id: a.id,
          institution: a.institution_name,
          type: a.account_type,
          last4: a.account_number_last4,
          balance: parseFloat(a.balance) || 0,
          creditLimit: parseFloat(a.credit_limit) || null,
          utilization: a.credit_limit ? Math.round((Math.abs(a.balance || 0) / a.credit_limit) * 100) : null,
          lastStatementDate: a.last_statement_date,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch accounts' });
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
