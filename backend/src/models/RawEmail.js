const db = require('../config/database');

const RawEmail = {
  async create(email) {
    const result = await db.query(
      `INSERT INTO raw_emails (user_id, gmail_message_id, sender, subject, body_html, body_text,
        attachments, received_at, email_category, sync_run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (gmail_message_id) DO NOTHING
       RETURNING *`,
      [email.user_id, email.gmail_message_id, email.sender, email.subject,
       email.body_html, email.body_text, JSON.stringify(email.attachments || []),
       email.received_at, email.email_category, email.sync_run_id || null]
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
    const [statusResult, categoryResult, rawTxnResult] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN parsing_status = 'success' THEN 1 END) as success,
           COUNT(CASE WHEN parsing_status = 'failed' THEN 1 END) as failed,
           COUNT(CASE WHEN parsing_status = 'pending' THEN 1 END) as pending
         FROM raw_emails WHERE user_id = $1`,
        [userId]
      ),
      db.query(
        `SELECT email_category, COUNT(*) as count
         FROM raw_emails WHERE user_id = $1 AND parsing_status = 'success'
         GROUP BY email_category`,
        [userId]
      ),
      db.query(
        'SELECT COUNT(*) as count FROM raw_transactions WHERE user_id = $1',
        [userId]
      ),
    ]);
    const categories = {};
    for (const row of categoryResult.rows) {
      categories[row.email_category] = parseInt(row.count);
    }
    return {
      ...statusResult.rows[0],
      categories,
      rawTransactions: parseInt(rawTxnResult.rows[0].count),
    };
  },

  async updateObservability(emailId, data) {
    await db.query(
      `UPDATE raw_emails SET
         processing_time_ms = $2,
         parser_used = $3,
         llm_used = $4,
         llm_tokens_used = $5,
         confidence_score = $6,
         error_type = $7,
         transactions_extracted = $8,
         processing_details = $9
       WHERE id = $1`,
      [emailId, data.processing_time_ms, data.parser_used, data.llm_used,
       data.llm_tokens_used, data.confidence_score, data.error_type,
       data.transactions_extracted, JSON.stringify(data.processing_details || {})]
    );
  },

  async getBySyncRun(syncRunId, { limit = 100, offset = 0, status, errorType } = {}) {
    let query = 'SELECT id, sender, subject, email_category, parsing_status, processing_time_ms, parser_used, llm_used, confidence_score, error_type, transactions_extracted, received_at FROM raw_emails WHERE sync_run_id = $1';
    const params = [syncRunId];
    let idx = 2;

    if (status) {
      query += ` AND parsing_status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (errorType) {
      query += ` AND error_type = $${idx}`;
      params.push(errorType);
      idx++;
    }

    query += ` ORDER BY received_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  },

  async getById(emailId) {
    const result = await db.query('SELECT * FROM raw_emails WHERE id = $1', [emailId]);
    return result.rows[0];
  },

  async getAggregateStats(userId) {
    const result = await db.query(
      `SELECT
         COUNT(*) as total,
         COUNT(CASE WHEN parsing_status = 'success' THEN 1 END) as success,
         COUNT(CASE WHEN parsing_status = 'failed' THEN 1 END) as failed,
         AVG(processing_time_ms) as avg_processing_ms,
         AVG(confidence_score) as avg_confidence,
         COUNT(CASE WHEN llm_used = TRUE THEN 1 END) as llm_used_count,
         SUM(llm_tokens_used) as total_llm_tokens
       FROM raw_emails WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  },

  async getErrorBreakdown(userId) {
    const result = await db.query(
      `SELECT error_type, COUNT(*) as count
       FROM raw_emails WHERE user_id = $1 AND error_type IS NOT NULL
       GROUP BY error_type ORDER BY count DESC`,
      [userId]
    );
    return result.rows;
  },

  async getSenderStats(userId) {
    const result = await db.query(
      `SELECT
         split_part(sender, '@', 2) as domain,
         COUNT(*) as total,
         COUNT(CASE WHEN parsing_status = 'success' THEN 1 END) as success,
         AVG(confidence_score) as avg_confidence,
         AVG(processing_time_ms) as avg_time_ms
       FROM raw_emails WHERE user_id = $1
       GROUP BY domain ORDER BY total DESC`,
      [userId]
    );
    return result.rows;
  },

  async getParserStats(userId) {
    const result = await db.query(
      `SELECT
         parser_used,
         COUNT(*) as total,
         COUNT(CASE WHEN parsing_status = 'success' THEN 1 END) as success,
         AVG(confidence_score) as avg_confidence,
         AVG(processing_time_ms) as avg_time_ms,
         COUNT(CASE WHEN llm_used = TRUE THEN 1 END) as llm_fallback_count
       FROM raw_emails WHERE user_id = $1 AND parser_used IS NOT NULL
       GROUP BY parser_used ORDER BY total DESC`,
      [userId]
    );
    return result.rows;
  },
};

module.exports = RawEmail;
