const db = require('../config/database');

const Bill = {
  async create(bill) {
    const result = await db.query(
      `INSERT INTO bills (user_id, biller_name, bill_type, account_number, amount, due_date,
        reminder_email_id, recurrence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [bill.user_id, bill.biller_name, bill.bill_type, bill.account_number,
       bill.amount, bill.due_date, bill.reminder_email_id, bill.recurrence]
    );
    return result.rows[0];
  },

  async getByUser(userId, { upcoming = false } = {}) {
    let query = 'SELECT * FROM bills WHERE user_id = $1';
    const params = [userId];
    if (upcoming) {
      query += ' AND due_date >= CURRENT_DATE AND paid = FALSE';
    }
    query += ' ORDER BY due_date ASC';
    const result = await db.query(query, params);
    return result.rows;
  },

  async markPaid(billId, transactionId) {
    const result = await db.query(
      `UPDATE bills SET paid = TRUE, paid_at = NOW(), payment_transaction_id = $2
       WHERE id = $1 RETURNING *`,
      [billId, transactionId]
    );
    return result.rows[0];
  },

  async getUpcomingCount(userId) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM bills
       WHERE user_id = $1 AND due_date >= CURRENT_DATE AND paid = FALSE`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = Bill;
