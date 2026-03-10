const db = require('../config/database');

const RawEmail = {
  async create(email) {
    const result = await db.query(
      `INSERT INTO raw_emails (user_id, gmail_message_id, sender, subject, body_html, body_text,
        attachments, received_at, email_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (gmail_message_id) DO NOTHING
       RETURNING *`,
      [email.user_id, email.gmail_message_id, email.sender, email.subject,
       email.body_html, email.body_text, JSON.stringify(email.attachments || []),
       email.received_at, email.email_category]
    );
    return result.rows[0];
  },

  async markProcessed(emailId, { status = 'success', errors = null } = {}) {
    await db.query(
      `UPDATE raw_emails SET processed_at = NOW(), parsing_status = $2, parsing_errors = $3
       WHERE id = $1`,
      [emailId, status, errors]
    );
  },

  async getPending(userId) {
    const result = await db.query(
      `SELECT * FROM raw_emails WHERE user_id = $1 AND parsing_status = 'pending'
       ORDER BY received_at ASC`,
      [userId]
    );
    return result.rows;
  },

  async existsByGmailId(gmailMessageId) {
    const result = await db.query(
      'SELECT id FROM raw_emails WHERE gmail_message_id = $1', [gmailMessageId]
    );
    return result.rows.length > 0;
  },

  async getStats(userId) {
    const result = await db.query(
      `SELECT
         COUNT(*) as total,
         COUNT(CASE WHEN parsing_status = 'success' THEN 1 END) as success,
         COUNT(CASE WHEN parsing_status = 'failed' THEN 1 END) as failed,
         COUNT(CASE WHEN parsing_status = 'pending' THEN 1 END) as pending
       FROM raw_emails WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  },
};

module.exports = RawEmail;
