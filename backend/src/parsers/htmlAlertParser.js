const cheerio = require('cheerio');
const { parseIndianDate, parseINRAmount } = require('../utils/indianFormats');

/**
 * Parse HTML transaction alert emails from Indian banks
 * Returns { data, meta } envelope for observability
 */
function parseTransactionAlert(emailBody, sender, subject, senderInfo = null) {
  const startTime = Date.now();
  const fieldsExtracted = [];
  const fieldsMissing = [];
  const warnings = [];

  const text = extractTextFromHtml(emailBody);
  const combined = (subject || '') + ' ' + text;

  const amount = extractAmount(combined);
  const date = extractDate(combined);
  const accountLast4 = extractAccountLast4(combined);
  const merchant = extractMerchant(combined);
  const isDebit = detectDebitOrCredit(combined);
  const paymentMethod = extractPaymentMethod(combined);
  const balanceAfter = extractBalance(combined);

  if (amount !== null) fieldsExtracted.push('amount'); else fieldsMissing.push('amount');
  if (date) fieldsExtracted.push('date'); else { fieldsMissing.push('date'); warnings.push('date_fallback_to_today'); }
  if (accountLast4) fieldsExtracted.push('account_last4'); else fieldsMissing.push('account_last4');
  if (merchant) fieldsExtracted.push('merchant'); else { fieldsMissing.push('merchant'); warnings.push('merchant_fallback_to_unknown'); }
  if (balanceAfter !== null) fieldsExtracted.push('balance_after'); else fieldsMissing.push('balance_after');
  if (paymentMethod !== 'Other') fieldsExtracted.push('payment_method');

  const duration_ms = Date.now() - startTime;

  let confidence = 0;
  if (amount !== null) confidence += 30;
  if (date) confidence += 20;
  if (merchant) confidence += 20;
  if (accountLast4) confidence += 15;
  if (balanceAfter !== null) confidence += 10;
  confidence += 5; // transaction_type always present

  if (amount === null) {
    return {
      data: null,
      meta: { parser: 'htmlAlertParser', duration_ms, fields_extracted: fieldsExtracted, fields_missing: fieldsMissing, confidence: 0, warnings: ['no_amount_found'] },
    };
  }

  return {
    data: {
      amount: isDebit ? -Math.abs(amount) : Math.abs(amount),
      date: date || new Date().toISOString().split('T')[0],
      merchant: merchant || 'Unknown',
      account_last4: accountLast4,
      account_type: detectAccountType(combined, senderInfo),
      transaction_type: isDebit ? 'debit' : 'credit',
      payment_method: paymentMethod,
      balance_after: balanceAfter,
      source: 'email_alert',
      metadata: { sender, institution: senderInfo?.name },
    },
    meta: { parser: 'htmlAlertParser', duration_ms, fields_extracted: fieldsExtracted, fields_missing: fieldsMissing, confidence, warnings },
  };
}

function extractTextFromHtml(html) {
  if (!html) return '';
  try {
    const $ = cheerio.load(html);
    return $.text().replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function extractAmount(text) {
  // Patterns: ₹520.00, Rs 520.00, Rs. 1,520, INR 520.00
  const patterns = [
    /(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/i,
    /(?:amount|debited|credited|spent|received|paid)[:\s]*(?:₹|Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return null;
}

function extractDate(text) {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 5;
  const maxYear = currentYear; // Don't accept future years

  // Try context-specific date patterns first (near transaction keywords)
  const contextPatterns = [
    /(?:on|dated?|txn\s*date|transaction\s*date|value\s*date|posting\s*date)[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i,
    /(?:on|dated?|txn\s*date|transaction\s*date|value\s*date|posting\s*date)[:\s]*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{2,4})/i,
    // "11 Mar 2026 at 10:30" — date immediately before time
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{2,4})\s+(?:at\s+)?\d{1,2}:\d{2}/i,
    // "11/03/2026 10:30" — numeric date before time
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+\d{1,2}:\d{2}/i,
  ];

  for (const pattern of contextPatterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseDateMatch(match, minYear, maxYear);
      if (parsed) return parsed;
    }
  }

  // Fallback: find ALL dates and pick the most reasonable one
  const datePatterns = [
    { re: /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g, type: 'numeric' },
    { re: /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{2,4})/gi, type: 'alpha' },
  ];

  const candidates = [];
  for (const { re, type } of datePatterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const parsed = parseDateMatch(m, minYear, maxYear);
      if (parsed) candidates.push(parsed);
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Score each candidate: prefer recent past dates, penalize today/future/very old
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  candidates.sort((a, b) => {
    const da = new Date(a);
    const db = new Date(b);
    da.setHours(0, 0, 0, 0);
    db.setHours(0, 0, 0, 0);

    // Penalize future dates heavily
    const futA = da > today ? 1e12 : 0;
    const futB = db > today ? 1e12 : 0;

    // Penalize "today" slightly — real txn dates in email body are usually in the past
    // Copyright/footer dates are often the current year which can resolve to near-today
    const todayPenaltyA = (a === todayStr) ? 1e6 : 0;
    const todayPenaltyB = (b === todayStr) ? 1e6 : 0;

    // Prefer dates within last 90 days (likely transaction dates)
    const daysAgoA = (today - da) / 86400000;
    const daysAgoB = (today - db) / 86400000;
    const agePenaltyA = daysAgoA > 90 ? daysAgoA * 1000 : daysAgoA;
    const agePenaltyB = daysAgoB > 90 ? daysAgoB * 1000 : daysAgoB;

    return (agePenaltyA + futA + todayPenaltyA) - (agePenaltyB + futB + todayPenaltyB);
  });

  return candidates[0];
}

function parseDateMatch(match, minYear, maxYear) {
  let year = parseInt(match[3], 10);
  // Handle 2-digit years
  if (year < 100) {
    year += 2000;
  }
  // Reject years outside valid range
  if (year < minYear || year > maxYear) return null;

  if (match[2] && isNaN(match[2])) {
    return parseIndianDate(`${match[1]} ${match[2]} ${year}`);
  }
  return parseIndianDate(`${match[1]}/${match[2]}/${year}`);
}

function extractAccountLast4(text) {
  const patterns = [
    /(?:A\/c|Account|Card|Acct)[\s.:]*(?:No\.?\s*)?(?:\*+|X+|x+)?(\d{4})\b/i,
    /(?:XX|xx|\*{2,})(\d{4})\b/,
    /(?:ending|last\s+4)[\s:]*(\d{4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractMerchant(text) {
  // Helper to try cleaning + validating a candidate
  function tryClean(raw) {
    if (!raw) return null;
    const cleaned = cleanMerchantName(raw);
    if (cleaned && !isGarbageMerchant(cleaned)) return cleaned;
    return null;
  }

  // UPI reference: UPI/P2P/ref/merchant@handle or UPI-CR-XXXX-merchant
  const upiMatch = text.match(/UPI[\/\-](?:P2[PM]|CR|DR)?[\/\-]?\d*[\/\-]([^\/\s@]+)/i);
  if (upiMatch) {
    const r = tryClean(upiMatch[1].replace(/@.*/, '').replace(/\d+$/, '').trim());
    if (r) return r;
  }

  // "towards <merchant>" (common in HDFC emails: "towards Amazonin", "towards Swiggy")
  const towardsMatch = text.match(/towards\s+([A-Za-z][A-Za-z0-9\s&.'-]{1,50}?)(?:\s+on\s+\d|\s+for\s+Rs|\s+via\s|\s+ref\s|\s+was\s|,|\s+Amount|$)/i);
  if (towardsMatch) {
    const r = tryClean(towardsMatch[1]);
    if (r) return r;
  }

  // "at <merchant>" (common in card transaction alerts)
  const atMatch = text.match(/(?:spent|paid|purchase[d]?|transacted|used|debited)\s+(?:at|on|for)\s+([A-Za-z][A-Za-z0-9\s&.'-]{1,50}?)(?:\s+on\s+\d|\s+for\s+Rs|\s+via\s|\s+ref\s|,|\s+Amount|$)/i);
  if (atMatch) {
    const r = tryClean(atMatch[1]);
    if (r) return r;
  }

  // "to <merchant>" or "from <merchant>" (transfer alerts — broader verb coverage)
  const toFromMatch = text.match(/(?:transferred|sent|paid|debited|received|credited)\s+(?:to|from|by)\s+([A-Za-z][A-Za-z0-9\s&.'-]{1,50}?)(?:\s+on\s+\d|\s+for\s+Rs|\s+via\s|\s+ref\s|\s+was\s|,|\s+Amount|\s+Avl|$)/i);
  if (toFromMatch) {
    const r = tryClean(toFromMatch[1]);
    if (r) return r;
  }

  // "VPA <upi-id>" — extract merchant name from UPI VPA
  const vpaMatch = text.match(/VPA\s+([a-zA-Z0-9._-]+)@/i);
  if (vpaMatch) {
    // VPA like "swiggy@ybl" → "Swiggy", "amazonpay@apl" → "Amazonpay"
    const r = tryClean(vpaMatch[1].replace(/[._-]/g, ' '));
    if (r) return r;
  }

  // "Merchant: <name>" or "Payee: <name>" (some banks use explicit labels)
  const labelMatch = text.match(/(?:Merchant|Payee|Beneficiary|To)\s*[:\-]\s*([A-Za-z][A-Za-z0-9\s&.'-]{1,50}?)(?:\s+on\s+\d|\s+Ref|,|\s+A\/c|\s+Account|$)/i);
  if (labelMatch) {
    const r = tryClean(labelMatch[1]);
    if (r) return r;
  }

  // Info field: Info: <description>
  const infoMatch = text.match(/Info[:\s]+(.+?)(?:\s*Available|\s*Bal|\s*$)/i);
  if (infoMatch) {
    const info = infoMatch[1];
    const parts = info.split('/').filter(Boolean);
    if (parts.length > 2) {
      const r = tryClean(parts[parts.length - 1].replace(/@.*/, ''));
      if (r) return r;
    }
    const r = tryClean(info);
    if (r) return r;
  }

  // "debited for <merchant>" or "credited for <merchant>"
  const debitForMatch = text.match(/(?:debited|credited)\s+(?:for|towards)\s+([A-Za-z][A-Za-z0-9\s&.'-]{1,50}?)(?:\s+on\s+\d|\s+for\s+Rs|\s+via\s|\s+ref\s|,|\s+Amount|$)/i);
  if (debitForMatch) {
    const r = tryClean(debitForMatch[1]);
    if (r) return r;
  }

  return null;
}

/**
 * Detect garbage merchant names (link text, CTA buttons, product titles, etc.)
 */
function isGarbageMerchant(name) {
  if (!name) return true;
  const lower = name.toLowerCase().trim();

  // Too short to be meaningful
  if (lower.length <= 1) return true;

  // Common email CTA / link text (exact and prefix matches)
  const garbagePatterns = [
    /^know\s+more/i,
    /^more\s+details?/i,
    /^click\s+here/i,
    /^view\s+details?/i,
    /^see\s+more/i,
    /^learn\s+more/i,
    /^check\s+now/i,
    /^pay\s+now/i,
    /^download/i,
    /^unsubscribe/i,
    /^your\s+account/i,
    /^your\s+.*\s+card/i,
    /^your\s+.*\s+bank/i,
    /^dear\s+customer/i,
    /^dear\s+/i,
    /^important/i,
    /^transaction\s+alert/i,
    /^this\s+is\s+to/i,
    /^we\s+wish\s+to/i,
    /^update/i,
    /^manage\s+/i,
    /^report\s+/i,
  ];
  for (const pat of garbagePatterns) {
    if (pat.test(lower)) return true;
  }

  // Bank/institution names used as merchant (these are senders, not merchants)
  const bankNames = /^(hdfc|icici|sbi|axis|kotak|yes|idbi|bob|canara|pnb|union|indian|bandhan|rbl)\s*(bank)?$/i;
  if (bankNames.test(lower)) return true;

  // Product title-like strings (too long, has model numbers)
  if (name.length > 50) return true;
  if (/\d{4,}/.test(name)) return true; // Contains 4+ digit numbers (model numbers, order IDs)
  if ((name.match(/\s/g) || []).length > 6) return true; // More than 6 words

  // Looks like a full sentence or email subject rather than a merchant
  if (/\b(ending|credit card|debit card|a\/c|account)\b/i.test(name)) return true;

  return false;
}

function cleanMerchantName(name) {
  if (!name) return null;
  let cleaned = name
    .replace(/[@\d]+$/, '')
    .replace(/\s+/g, ' ')
    .replace(/[*#]+/g, '')
    .trim();

  // Strip common prefixes that leak from subject lines
  cleaned = cleaned
    .replace(/^your\s+(?:hdfc|icici|sbi|axis|kotak)\s+(?:bank\s+)?(?:credit\s+)?card\s+ending\s+\d+\s+towards\s+/i, '')
    .replace(/^your\s+account\s+/i, '')
    .trim();

  // Strip company suffixes (and their truncated forms)
  // Handles: "Pvt Ltd", "Private Limited", "Pte Ltd", "Inc", "LLP", "India", etc.
  cleaned = cleaned
    .replace(/\s*\.?\s*(?:Pvt|Private|Pte|Ltd|Limited|LLP|Inc|Corp|Co)\b\.?/gi, ' ')
    .replace(/\s*\.?\s*(?:India|Singapore|Payments?|Services?|Solutions?|Enterprises?|Technologies|Tech)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing "in" from "Amazonin", "Swiggyin" — but only when it looks like a
  // squished domain suffix (lowercase "in" right after a word with no space)
  cleaned = cleaned.replace(/([a-z])in$/i, '$1');

  // Strip trailing truncation artifacts: ". The", ". Si", single trailing words < 4 chars after a period
  cleaned = cleaned.replace(/\.\s+\w{1,4}$/, '').trim();
  // Strip trailing periods and whitespace
  cleaned = cleaned.replace(/[.\s]+$/, '').trim();

  if (!cleaned || cleaned.length <= 1) return null;

  return cleaned
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function detectDebitOrCredit(text) {
  // Remove "credit card" phrases so they don't trigger false credit detection
  const cleaned = text.replace(/credit\s*card/gi, 'CC').replace(/credit\s*limit/gi, 'CL').replace(/credit\s*score/gi, 'CS');

  const debitPatterns = /debited|debit(?:ed)?|spent|paid|purchase[d]?|withdrawn|sent|charged|payment\s+of|transaction\s+of|used\s+at|used\s+on|auto[\s-]?pay|has\s+been\s+used/i;
  const creditPatterns = /credited|credit(?:ed)?|received|deposited|refund(?:ed)?|cashback|reversed|reversal|money\s+received|amount\s+received|salary|interest\s+(?:credit|paid)|cr\b/i;

  const debitMatch = debitPatterns.test(cleaned);
  const creditMatch = creditPatterns.test(cleaned);

  // If both match, count occurrences — debit keywords are typically more specific
  if (debitMatch && creditMatch) {
    const debitCount = (cleaned.match(/debited|debit|spent|paid|purchase|withdrawn|sent|charged|used/gi) || []).length;
    const creditCount = (cleaned.match(/credited|received|deposited|refund|cashback|reversed|salary/gi) || []).length;
    return debitCount >= creditCount; // true = debit
  }

  if (debitMatch) return true;
  if (creditMatch) return false;
  return true; // Default to debit
}

function extractPaymentMethod(text) {
  if (/UPI/i.test(text)) return 'UPI';
  if (/NEFT/i.test(text)) return 'NEFT';
  if (/IMPS/i.test(text)) return 'IMPS';
  if (/RTGS/i.test(text)) return 'RTGS';
  if (/ATM|cash withdrawal/i.test(text)) return 'ATM';
  if (/POS|swipe|card\s+(?:payment|transaction)/i.test(text)) return 'Card';
  if (/net\s*banking|online/i.test(text)) return 'NetBanking';
  if (/auto[\s-]?debit|ECS|NACH/i.test(text)) return 'AutoDebit';
  return 'Other';
}

function extractBalance(text) {
  const match = text.match(/(?:Available\s+)?(?:Bal|Balance)[:\s]*(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/i);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return null;
}

function detectAccountType(text, senderInfo) {
  if (senderInfo?.type === 'credit_card') return 'credit_card';
  if (/credit\s*card/i.test(text)) return 'credit_card';
  if (/current\s*a\/c|current\s*account/i.test(text)) return 'current';
  return 'savings';
}

module.exports = { parseTransactionAlert, extractTextFromHtml, extractAmount, extractDate, extractAccountLast4, extractMerchant };
