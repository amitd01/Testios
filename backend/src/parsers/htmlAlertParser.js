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
  // DD/MM/YYYY or DD-MM-YYYY with optional time
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2] && isNaN(match[2])) {
        // DD MMM YYYY format
        return parseIndianDate(`${match[1]} ${match[2]} ${match[3]}`);
      }
      // DD/MM/YYYY
      return parseIndianDate(`${match[1]}/${match[2]}/${match[3]}`);
    }
  }
  return null;
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
  // UPI reference: UPI/P2P/ref/merchant@handle
  const upiMatch = text.match(/UPI[\/\-](?:P2[PM]|CR|DR)?[\/\-]?\d*[\/\-]([^\/\s@]+)/i);
  if (upiMatch) {
    let merchant = upiMatch[1].replace(/@.*/, '').replace(/\d+$/, '').trim();
    return cleanMerchantName(merchant);
  }

  // "at <merchant>" or "to <merchant>" or "from <merchant>"
  const atMatch = text.match(/(?:at|to|from|towards|for)\s+([A-Z][A-Za-z0-9\s&.'-]+?)(?:\s+on|\s+for|\s+via|\s+ref|\s*\.|$)/i);
  if (atMatch) {
    return cleanMerchantName(atMatch[1]);
  }

  // Info field: Info: <description>
  const infoMatch = text.match(/Info[:\s]+(.+?)(?:\s*Available|\s*Bal|\s*$)/i);
  if (infoMatch) {
    const info = infoMatch[1];
    // Try to extract merchant from info
    const parts = info.split('/').filter(Boolean);
    if (parts.length > 2) {
      return cleanMerchantName(parts[parts.length - 1].replace(/@.*/, ''));
    }
    return cleanMerchantName(info);
  }

  return null;
}

function cleanMerchantName(name) {
  if (!name) return null;
  return name
    .replace(/[@\d]+$/, '')
    .replace(/\s+/g, ' ')
    .replace(/[*#]+/g, '')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function detectDebitOrCredit(text) {
  const debitWords = /debit|spent|paid|purchase|withdrawn|debited|sent|charged|payment\s+of/i;
  const creditWords = /credit|received|deposited|credited|refund|cashback|reversed/i;

  if (debitWords.test(text)) return true;
  if (creditWords.test(text)) return false;
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
