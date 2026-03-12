const db = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SenderService');

// In-memory cache refreshed periodically
let domainCache = null;
let cacheLastRefreshed = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function refreshCache() {
  const result = await db.query(
    'SELECT * FROM sender_domains WHERE is_active = TRUE'
  );
  domainCache = new Map();
  for (const row of result.rows) {
    domainCache.set(row.domain, {
      name: row.institution_name,
      type: row.institution_type,
      subdomains_allowed: row.subdomains_allowed,
      template_hint: row.email_template_hint,
    });
  }
  cacheLastRefreshed = Date.now();
  logger.debug(`Cache refreshed with ${domainCache.size} domains`);
}

async function ensureCache() {
  if (!domainCache || Date.now() - cacheLastRefreshed > CACHE_TTL_MS) {
    await refreshCache();
  }
}

function getDomainFromEmail(email) {
  if (!email) return null;
  const match = email.match(/@(.+)$/);
  return match ? match[1].toLowerCase() : null;
}

async function isWhitelistedSender(senderEmail) {
  await ensureCache();
  const domain = getDomainFromEmail(senderEmail);
  if (!domain) return false;

  if (domainCache.has(domain)) return true;

  for (const [whitelistedDomain] of domainCache.entries()) {
    if (domain.endsWith('.' + whitelistedDomain)) return true;
  }

  return false;
}

async function getSenderInfo(senderEmail) {
  await ensureCache();
  const domain = getDomainFromEmail(senderEmail);
  if (!domain) return null;

  if (domainCache.has(domain)) return domainCache.get(domain);

  for (const [whitelistedDomain, info] of domainCache.entries()) {
    if (domain.endsWith('.' + whitelistedDomain)) return info;
  }

  return null;
}

async function getGmailSearchQuery() {
  await ensureCache();
  const domains = Array.from(domainCache.keys());
  const fromClauses = domains.map(d => `from:*@${d}`).join(' OR ');
  return `{${fromClauses}}`;
}

async function addSender(domain, { institutionName, institutionType, addedBy = 'user', templateHint = null } = {}) {
  const result = await db.query(
    `INSERT INTO sender_domains (domain, institution_name, institution_type, added_by, email_template_hint)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (domain) DO UPDATE SET
       institution_name = EXCLUDED.institution_name,
       institution_type = EXCLUDED.institution_type,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING *`,
    [domain.toLowerCase(), institutionName, institutionType, addedBy, templateHint]
  );
  domainCache = null; // invalidate cache
  return result.rows[0];
}

async function deactivateSender(domain) {
  await db.query(
    'UPDATE sender_domains SET is_active = FALSE, updated_at = NOW() WHERE domain = $1',
    [domain.toLowerCase()]
  );
  domainCache = null;
}

async function getAllSenders({ type, active } = {}) {
  let query = 'SELECT * FROM sender_domains WHERE 1=1';
  const params = [];
  let idx = 1;

  if (type) {
    query += ` AND institution_type = $${idx}`;
    params.push(type);
    idx++;
  }
  if (active !== undefined) {
    query += ` AND is_active = $${idx}`;
    params.push(active);
    idx++;
  }

  query += ' ORDER BY institution_name';
  const result = await db.query(query, params);
  return result.rows;
}

// Pending senders
async function recordPendingSender(domain, senderEmail, subject) {
  await db.query(
    `INSERT INTO pending_senders (domain, sample_sender, sample_subject)
     VALUES ($1, $2, $3)
     ON CONFLICT (domain) DO UPDATE SET
       occurrence_count = pending_senders.occurrence_count + 1,
       last_seen = NOW()`,
    [domain.toLowerCase(), senderEmail, subject]
  );
}

async function getPendingSenders() {
  const result = await db.query(
    `SELECT * FROM pending_senders WHERE status = 'pending'
     ORDER BY occurrence_count DESC`
  );
  return result.rows;
}

async function approvePendingSender(id, { institutionName, institutionType }) {
  const pending = await db.query('SELECT * FROM pending_senders WHERE id = $1', [id]);
  if (!pending.rows[0]) return null;

  const sender = await addSender(pending.rows[0].domain, {
    institutionName,
    institutionType,
    addedBy: 'user',
  });

  await db.query(
    "UPDATE pending_senders SET status = 'approved' WHERE id = $1",
    [id]
  );

  return sender;
}

module.exports = {
  getDomainFromEmail,
  isWhitelistedSender,
  getSenderInfo,
  getGmailSearchQuery,
  addSender,
  deactivateSender,
  getAllSenders,
  recordPendingSender,
  getPendingSenders,
  approvePendingSender,
  refreshCache,
};
