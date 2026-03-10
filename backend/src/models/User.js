const db = require('../config/database');
const { encrypt, decrypt } = require('../utils/encryption');

const User = {
  async create({ email, name, refreshToken, accessToken, tokenExpiry }) {
    const encryptedRefresh = encrypt(refreshToken);
    const encryptedAccess = encrypt(accessToken);
    const result = await db.query(
      `INSERT INTO users (email, name, gmail_refresh_token, gmail_access_token, gmail_token_expiry)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         gmail_refresh_token = EXCLUDED.gmail_refresh_token,
         gmail_access_token = EXCLUDED.gmail_access_token,
         gmail_token_expiry = EXCLUDED.gmail_token_expiry,
         updated_at = NOW()
       RETURNING *`,
      [email, name, encryptedRefresh, encryptedAccess, tokenExpiry]
    );
    return result.rows[0];
  },

  async findById(id) {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async findByEmail(email) {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  },

  async getDecryptedTokens(userId) {
    const user = await this.findById(userId);
    if (!user) return null;
    return {
      refreshToken: decrypt(user.gmail_refresh_token),
      accessToken: decrypt(user.gmail_access_token),
      tokenExpiry: user.gmail_token_expiry,
    };
  },

  async updateTokens(userId, { accessToken, refreshToken, tokenExpiry }) {
    const updates = [];
    const values = [];
    let idx = 1;

    if (accessToken) {
      updates.push(`gmail_access_token = $${idx++}`);
      values.push(encrypt(accessToken));
    }
    if (refreshToken) {
      updates.push(`gmail_refresh_token = $${idx++}`);
      values.push(encrypt(refreshToken));
    }
    if (tokenExpiry) {
      updates.push(`gmail_token_expiry = $${idx++}`);
      values.push(tokenExpiry);
    }
    updates.push(`updated_at = NOW()`);
    values.push(userId);

    await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );
  },

  async updateLastSync(userId) {
    await db.query(
      'UPDATE users SET gmail_last_sync = NOW(), updated_at = NOW() WHERE id = $1',
      [userId]
    );
  },

  async setOnboarded(userId) {
    await db.query(
      'UPDATE users SET onboarded = TRUE, updated_at = NOW() WHERE id = $1',
      [userId]
    );
  },

  async deleteAllData(userId) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM budgets WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM goals WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM investments WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM bills WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM raw_transactions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM raw_emails WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM accounts WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM email_senders WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = User;
