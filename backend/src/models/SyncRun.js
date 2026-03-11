const db = require('../config/database');

const SyncRun = {
  async create(userId, runType, { searchQuery, sinceDate } = {}) {
    const result = await db.query(
      `INSERT INTO sync_runs (user_id, run_type, search_query, since_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, runType, searchQuery || null, sinceDate || null]
    );
    return result.rows[0];
  },

  async incrementCounters(id, counters) {
    const sets = [];
    const values = [id];
    let idx = 2;

    for (const [field, delta] of Object.entries(counters)) {
      sets.push(`${field} = ${field} + $${idx}`);
      values.push(delta);
      idx++;
    }

    if (sets.length === 0) return;

    await db.query(
      `UPDATE sync_runs SET ${sets.join(', ')} WHERE id = $1`,
      values
    );
  },

  async complete(id, status, errorSummary = {}) {
    await db.query(
      `UPDATE sync_runs
       SET status = $2,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER * 1000,
           error_summary = $3
       WHERE id = $1`,
      [id, status, JSON.stringify(errorSummary)]
    );
  },

  async getByUser(userId, { limit = 20, offset = 0 } = {}) {
    const result = await db.query(
      `SELECT * FROM sync_runs WHERE user_id = $1
       ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  },

  async getById(id) {
    const result = await db.query('SELECT * FROM sync_runs WHERE id = $1', [id]);
    return result.rows[0];
  },

  async getLatest(userId) {
    const result = await db.query(
      `SELECT * FROM sync_runs WHERE user_id = $1
       ORDER BY started_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0];
  },
};

module.exports = SyncRun;
