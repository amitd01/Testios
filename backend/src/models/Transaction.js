const db = require('../config/database');

const Transaction = {
  async insertRaw(txn) {
    const result = await db.query(
      `INSERT INTO raw_transactions (user_id, email_id, amount, date, merchant, account_last4,
        account_type, transaction_type, payment_method, balance_after, category, source, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [txn.user_id, txn.email_id, txn.amount, txn.date, txn.merchant, txn.account_last4,
       txn.account_type, txn.transaction_type, txn.payment_method, txn.balance_after,
       txn.category, txn.source, JSON.stringify(txn.metadata || {})]
    );
    return result.rows[0];
  },

  async insertHarmonized(txn) {
    const result = await db.query(
      `INSERT INTO transactions (user_id, amount, date, merchant, merchant_detail, category,
        account_last4, account_type, transaction_type, sources, verified, trust_score,
        raw_transaction_ids, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [txn.user_id, txn.amount, txn.date, txn.merchant, txn.merchant_detail, txn.category,
       txn.account_last4, txn.account_type, txn.transaction_type, txn.sources,
       txn.verified, txn.trust_score, txn.raw_transaction_ids, JSON.stringify(txn.metadata || {})]
    );
    return result.rows[0];
  },

  async getByUser(userId, { limit = 50, offset = 0, category, startDate, endDate, search, accountLast4 } = {}) {
    let query = 'SELECT * FROM transactions WHERE user_id = $1';
    const params = [userId];
    let idx = 2;

    if (category) {
      query += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (startDate) {
      query += ` AND date >= $${idx++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date <= $${idx++}`;
      params.push(endDate);
    }
    if (search) {
      query += ` AND (merchant ILIKE $${idx} OR merchant_detail ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (accountLast4) {
      query += ` AND account_last4 = $${idx++}`;
      params.push(accountLast4);
    }

    query += ` ORDER BY date DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  },

  async getMonthlySpending(userId, month) {
    const result = await db.query(
      `SELECT category, SUM(ABS(amount)) as total
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date < ($2::date + interval '1 month')
         AND transaction_type = 'debit'
       GROUP BY category
       ORDER BY total DESC`,
      [userId, month]
    );
    return result.rows;
  },

  async getCashFlow(userId, month) {
    const result = await db.query(
      `SELECT
         SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) as income,
         SUM(CASE WHEN transaction_type = 'debit' THEN ABS(amount) ELSE 0 END) as spending
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date < ($2::date + interval '1 month')`,
      [userId, month]
    );
    return result.rows[0];
  },

  async getUnprocessedRaw(userId) {
    const result = await db.query(
      `SELECT rt.* FROM raw_transactions rt
       LEFT JOIN transactions t ON rt.id = ANY(t.raw_transaction_ids)
       WHERE rt.user_id = $1 AND t.id IS NULL
       ORDER BY rt.date DESC`,
      [userId]
    );
    return result.rows;
  },

  async getCount(userId) {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM transactions WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = Transaction;
