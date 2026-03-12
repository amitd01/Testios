const cheerio = require('cheerio');
const { parseIndianDate, parseINRAmount } = require('./indianFormats');

/**
 * Regex-based validators for cross-checking LLM output.
 * These extract reliable numeric/structured fields from email text.
 * NOT used as primary parsers — only for validation against LLM results.
 */

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

function extractBalance(text) {
  const match = text.match(/(?:Available\s+)?(?:Bal|Balance)[:\s]*(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/i);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return null;
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

/**
 * Extract merchant name from plain text of Indian bank alert emails.
 * Uses common patterns found in Indian bank/card/UPI alerts.
 */
function extractMerchantFromText(text) {
  if (!text) return null;

  const patterns = [
    // UPI VPA: "to VPA swiggy@ybl" or "VPA: merchant@upi"
    /(?:to\s+)?VPA[\s:]+([a-zA-Z0-9._-]+)@/i,
    // "at <MERCHANT> on <date>" pattern (POS/Card transactions) — POS prefix stripped later
    /\bat\s+(?:POS\s+)?([A-Za-z][A-Za-z0-9\s&.'/-]*?)\s+(?:on\s+\d|for\s+(?:Rs|INR|₹)|Avl\s|Avail|Available|Info)/i,
    // "paid to <MERCHANT>" pattern
    /(?:paid|amount\s*(?:Rs\.?|INR)?\s*[\d,.]+\s*paid)\s+to\s+([A-Za-z][A-Za-z0-9\s&.'/-]*?)\s+(?:on\s+\d|for\s+|via\s+|using\s+)/i,
    // "transferred/sent to <MERCHANT>" pattern
    /(?:transferred|sent)\s+to\s+([A-Za-z][A-Za-z0-9\s&.'/-]*?)\s+(?:on\s+\d|for\s+|via\s+)/i,
    // "towards <MERCHANT>" pattern
    /towards\s+([A-Za-z][A-Za-z0-9\s&.'/-]*?)\s+(?:on\s+\d|for\s+(?:Rs|INR|₹)|was\s|Amount)/i,
    // "from <MERCHANT>" for credits (salary, refunds, etc.)
    /(?:received|credited|credit)\s+(?:from|by)\s+([A-Za-z][A-Za-z0-9\s&.'/-]*?)(?:\s+on\s+\d|\s+for\s+|\s+salary|\.\s)/i,
    // "Info: UPI/<type>/<ref>/<merchant>@upi" pattern
    /Info:\s*UPI\/[^/]+\/[^/]+\/([a-zA-Z][a-zA-Z0-9._-]*?)(?:@|\s)/i,
    // "debited for <MERCHANT>" or "purchase at <MERCHANT>"
    /(?:debited\s+for|purchase\s+at)\s+([A-Za-z][A-Za-z0-9\s&.'/-]*?)\s+(?:on\s+\d)/i,
    // ATM withdrawal patterns
    /(?:ATM\s+(?:cash\s+)?withdraw(?:al|n)?|withdraw(?:al|n)?\s+(?:at|from)\s+ATM)/i,
    // "debited by <MERCHANT>" or "debited to <MERCHANT>"
    /debited\s+(?:by|to)\s+([A-Za-z][A-Za-z0-9\s&.'/-]*?)\s+(?:on\s+\d|for\s+|via\s+|Ref)/i,
    // "credited by <MERCHANT>" broader
    /credited\s+(?:by|from)\s+([A-Za-z][A-Za-z0-9\s&.'/-]*?)(?:\s+on\s+\d|\s+Ref|\s+UPI|\.\s|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // ATM pattern has no capture group — return fixed value
      if (!match[1] && /atm/i.test(match[0])) return 'ATM Withdrawal';
      if (!match[1]) continue;
      let merchant = match[1].trim();

      // For UPI VPA, clean up: "swiggy" → "Swiggy"
      if (pattern.source.includes('VPA')) {
        merchant = merchant.split(/[._-]/)[0]; // take first part before dots/dashes
      }

      // Strip POS prefix
      merchant = merchant.replace(/^POS\s+/i, '');

      // Strip common suffixes
      merchant = merchant
        .replace(/\s+(?:Pvt|Private)\s*\.?\s*(?:Ltd|Limited)\.?/gi, '')
        .replace(/\s+(?:Pte)\s*\.?\s*(?:Ltd)\.?/gi, '')
        .replace(/\s+(?:LLP|Inc)\b\.?/gi, '')
        .replace(/\s+(?:India|Payments?|Services?|Solutions?|Technologies|Enterprises?)\s*$/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Reject if too short or looks like account info
      if (merchant.length < 2) continue;
      if (/^\d+$/.test(merchant)) continue;
      if (/^(credit card|debit card|account|a\/c|pos)$/i.test(merchant)) continue;

      return merchant;
    }
  }

  return null;
}

/**
 * Cross-validate LLM output against regex-extracted values.
 * Returns { corrected, warnings } where corrected is the LLM data with regex overrides.
 */
function crossValidate(llmData, emailText) {
  const warnings = [];
  const corrected = { ...llmData };
  const text = extractTextFromHtml(emailText);

  // Cross-validate amount (regex is more reliable for numbers)
  const regexAmount = extractAmount(text);
  if (regexAmount && llmData.amount) {
    if (Math.abs(regexAmount - llmData.amount) > 0.01) {
      corrected.amount = regexAmount;
      warnings.push(`amount_corrected_by_regex: LLM=${llmData.amount} regex=${regexAmount}`);
    }
  } else if (regexAmount && !llmData.amount) {
    corrected.amount = regexAmount;
    warnings.push('amount_filled_by_regex');
  }

  // Cross-validate account_last4
  const regexAccount = extractAccountLast4(text);
  if (regexAccount && llmData.account_last4) {
    if (regexAccount !== llmData.account_last4) {
      corrected.account_last4 = regexAccount;
      warnings.push(`account_corrected_by_regex: LLM=${llmData.account_last4} regex=${regexAccount}`);
    }
  } else if (regexAccount && !llmData.account_last4) {
    corrected.account_last4 = regexAccount;
    warnings.push('account_filled_by_regex');
  }

  // Cross-validate balance
  const regexBalance = extractBalance(text);
  if (regexBalance && llmData.balance_after) {
    if (Math.abs(regexBalance - llmData.balance_after) > 0.01) {
      corrected.balance_after = regexBalance;
      warnings.push(`balance_corrected_by_regex: LLM=${llmData.balance_after} regex=${regexBalance}`);
    }
  } else if (regexBalance && !llmData.balance_after) {
    corrected.balance_after = regexBalance;
    warnings.push('balance_filled_by_regex');
  }

  // Fill payment method if LLM returned Other or null
  if (!llmData.payment_method || llmData.payment_method === 'Other') {
    const regexMethod = extractPaymentMethod(text);
    if (regexMethod !== 'Other') {
      corrected.payment_method = regexMethod;
    }
  }

  // Fill merchant if LLM returned null/Unknown
  if (!llmData.merchant || llmData.merchant === 'Unknown') {
    const regexMerchant = extractMerchantFromText(text);
    if (regexMerchant) {
      corrected.merchant = regexMerchant;
      warnings.push('merchant_filled_by_regex');
    }
  }

  return { corrected, warnings };
}

module.exports = {
  extractTextFromHtml,
  extractAmount,
  extractAccountLast4,
  extractBalance,
  extractPaymentMethod,
  extractMerchantFromText,
  crossValidate,
};
