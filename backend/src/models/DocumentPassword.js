const crypto = require('crypto');
const db = require('../config/database');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const key = process.env.DOCUMENT_PASSWORD_KEY;
  if (!key) {
    throw new Error('DOCUMENT_PASSWORD_KEY not set in environment');
  }
  // Ensure key is exactly 32 bytes for AES-256
  return crypto.createHash('sha256').update(key).digest();
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText) {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const DocumentPassword = {
  async upsert({ userId, institutionDomain, password, passwordHint }) {
    const encrypted = encrypt(password);
    const result = await db.query(
      `INSERT INTO document_passwords (user_id, institution_domain, password_encrypted, password_hint)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, institution_domain)
       DO UPDATE SET password_encrypted = EXCLUDED.password_encrypted,
                     password_hint = COALESCE(EXCLUDED.password_hint, document_passwords.password_hint),
                     updated_at = NOW()
       RETURNING id, user_id, institution_domain, password_hint, created_at, updated_at`,
      [userId, institutionDomain, encrypted, passwordHint]
    );
    return result.rows[0];
  },

  async getByDomain(userId, domain) {
    const result = await db.query(
      'SELECT * FROM document_passwords WHERE user_id = $1 AND institution_domain = $2',
      [userId, domain]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      ...row,
      password: decrypt(row.password_encrypted),
    };
  },

  async getByUser(userId) {
    const result = await db.query(
      `SELECT id, user_id, institution_domain, password_hint, created_at, updated_at
       FROM document_passwords WHERE user_id = $1 ORDER BY institution_domain`,
      [userId]
    );
    return result.rows;
  },

  async delete(id, userId) {
    const result = await db.query(
      'DELETE FROM document_passwords WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rows[0];
  },
};

module.exports = DocumentPassword;
