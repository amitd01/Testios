const db = require('../config/database');

const Account = {
  async upsert({ userId, institutionName, accountType, instrumentType, accountLast4, balance, creditLimit, statementDate, statementEmailId }) {
    const result = await db.query(
      `INSERT INTO accounts (user_id, institution_name, account_type, instrument_type, account_number_last4, balance, credit_limit, last_statement_date, last_statement_email_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, institution_name, account_number_last4)
       DO UPDATE SET
         balance = COALESCE(EXCLUDED.balance, accounts.balance),
         credit_limit = COALESCE(EXCLUDED.credit_limit, accounts.credit_limit),
         instrument_type = COALESCE(EXCLUDED.instrument_type, accounts.instrument_type),
         last_statement_date = COALESCE(EXCLUDED.last_statement_date, accounts.last_statement_date),
         last_statement_email_id = COALESCE(EXCLUDED.last_statement_email_id, accounts.last_statement_email_id),
         updated_at = NOW()
       RETURNING *`,
      [userId, institutionName, accountType, instrumentType || null, accountLast4, balance, creditLimit, statementDate, statementEmailId]
    );
    return result.rows[0];
  },

  async getByUser(userId) {
    const result = await db.query(
      'SELECT * FROM accounts WHERE user_id = $1 ORDER BY institution_name',
      [userId]
    );
    return result.rows;
  },

  async getById(accountId) {
    const result = await db.query(
      'SELECT * FROM accounts WHERE id = $1',
      [accountId]
    );
    return result.rows[0];
  },

  /**
   * Get transaction ledger for a specific account
   * Returns chronological transactions with optional date range filter
   */
  async getTransactions(accountId, { limit = 50, offset = 0, startDate, endDate } = {}) {
    let query = `SELECT * FROM transactions WHERE account_id = $1`;
    const params = [accountId];
    let idx = 2;

    if (startDate) {
      query += ` AND date >= $${idx++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date <= $${idx++}`;
      params.push(endDate);
    }

    query += ` ORDER BY date DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  },

  /**
   * Get transaction count for an account
   */
  async getTransactionCount(accountId) {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM transactions WHERE account_id = $1',
      [accountId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  async getNetWorth(userId) {
    const result = await db.query(
      `SELECT
         SUM(CASE WHEN account_type IN ('savings', 'current') THEN COALESCE(balance, 0) ELSE 0 END) as bank_balance,
         SUM(CASE WHEN account_type = 'credit_card' THEN COALESCE(balance, 0) ELSE 0 END) as cc_outstanding,
         SUM(CASE WHEN account_type = 'credit_card' THEN COALESCE(credit_limit, 0) ELSE 0 END) as cc_limit
       FROM accounts WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  },
};

module.exports = Account;
