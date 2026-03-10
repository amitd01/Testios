const db = require('../config/database');

const Budget = {
  async upsert({ userId, category, monthlyLimit, month }) {
    const result = await db.query(
      `INSERT INTO budgets (user_id, category, monthly_limit, month)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, category, month)
       DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit
       RETURNING *`,
      [userId, category, monthlyLimit, month]
    );
    return result.rows[0];
  },

  async getByUser(userId, month) {
    const result = await db.query(
      `SELECT b.*, COALESCE(
         (SELECT SUM(ABS(t.amount)) FROM transactions t
          WHERE t.user_id = b.user_id AND t.category = b.category
            AND t.transaction_type = 'debit'
            AND t.date >= b.month AND t.date < (b.month + interval '1 month')),
       0) as current_spent
       FROM budgets b WHERE b.user_id = $1 AND b.month = $2
       ORDER BY b.category`,
      [userId, month]
    );
    return result.rows;
  },

  async delete(budgetId) {
    await db.query('DELETE FROM budgets WHERE id = $1', [budgetId]);
  },
};

module.exports = Budget;
