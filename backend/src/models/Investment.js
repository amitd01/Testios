const db = require('../config/database');

const Investment = {
  async upsert(inv) {
    const result = await db.query(
      `INSERT INTO investments (user_id, institution_name, investment_type, scheme_name,
        units, nav, current_value, invested_value, statement_date, statement_email_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [inv.user_id, inv.institution_name, inv.investment_type, inv.scheme_name,
       inv.units, inv.nav, inv.current_value, inv.invested_value, inv.statement_date, inv.statement_email_id]
    );
    return result.rows[0];
  },

  async getByUser(userId) {
    const result = await db.query(
      'SELECT * FROM investments WHERE user_id = $1 ORDER BY current_value DESC',
      [userId]
    );
    return result.rows;
  },

  async getPortfolioSummary(userId) {
    const result = await db.query(
      `SELECT investment_type,
         SUM(current_value) as total_value,
         SUM(invested_value) as total_invested,
         COUNT(*) as holdings_count
       FROM investments WHERE user_id = $1
       GROUP BY investment_type`,
      [userId]
    );
    return result.rows;
  },
};

module.exports = Investment;
