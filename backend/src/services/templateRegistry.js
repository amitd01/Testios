const db = require('../config/database');
const crypto = require('crypto');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TemplateRegistry');

/**
 * Generate a fingerprint from HTML structure (ignoring content)
 * This captures the DOM skeleton so we can detect when a sender changes their template
 */
function generateFingerprint(html) {
  if (!html) return null;
  // Extract tag structure only, stripping content and attributes
  const tags = html.match(/<\/?[a-z][a-z0-9]*[^>]*>/gi) || [];
  const skeleton = tags
    .map(tag => tag.replace(/\s[^>]*/g, '').toLowerCase())
    .join('');
  return crypto.createHash('md5').update(skeleton).digest('hex').substring(0, 32);
}

/**
 * Look up a template for a given sender domain + content type + HTML fingerprint
 */
async function findTemplate(domain, templateType, html) {
  const fingerprint = generateFingerprint(html);

  // Try exact fingerprint match first
  if (fingerprint) {
    const exact = await db.query(
      `SELECT * FROM email_templates
       WHERE institution_domain = $1 AND template_type = $2 AND template_fingerprint = $3`,
      [domain, templateType, fingerprint]
    );
    if (exact.rows[0]) {
      await db.query(
        'UPDATE email_templates SET last_used_at = NOW() WHERE id = $1',
        [exact.rows[0].id]
      );
      return exact.rows[0];
    }
  }

  // Fall back to domain + type match (no fingerprint)
  const fallback = await db.query(
    `SELECT * FROM email_templates
     WHERE institution_domain = $1 AND template_type = $2
     ORDER BY total_parsed DESC LIMIT 1`,
    [domain, templateType]
  );
  return fallback.rows[0] || null;
}

/**
 * Record a successful parse — store or update the template
 */
async function recordSuccess(domain, templateType, html, emailId) {
  const fingerprint = generateFingerprint(html);

  await db.query(
    `INSERT INTO email_templates (institution_domain, template_type, template_fingerprint, sample_email_id, total_parsed, success_rate, last_used_at)
     VALUES ($1, $2, $3, $4, 1, 100, NOW())
     ON CONFLICT (institution_domain, template_type, template_fingerprint)
     DO UPDATE SET
       total_parsed = email_templates.total_parsed + 1,
       success_rate = (email_templates.success_rate * email_templates.total_parsed + 100) / (email_templates.total_parsed + 1),
       last_used_at = NOW(),
       updated_at = NOW()`,
    [domain, templateType, fingerprint || 'default', emailId]
  );
}

/**
 * Record a failed parse for a template
 */
async function recordFailure(domain, templateType, html) {
  const fingerprint = generateFingerprint(html);
  if (!fingerprint) return;

  await db.query(
    `UPDATE email_templates SET
       success_rate = (success_rate * total_parsed) / (total_parsed + 1),
       total_parsed = total_parsed + 1,
       updated_at = NOW()
     WHERE institution_domain = $1 AND template_type = $2 AND template_fingerprint = $3`,
    [domain, templateType, fingerprint]
  );
}

/**
 * Get all templates with stats (for admin view)
 */
async function getAllTemplates() {
  const result = await db.query(
    `SELECT * FROM email_templates ORDER BY total_parsed DESC`
  );
  return result.rows;
}

module.exports = { generateFingerprint, findTemplate, recordSuccess, recordFailure, getAllTemplates };
