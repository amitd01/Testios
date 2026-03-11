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

  return { corrected, warnings };
}

module.exports = {
  extractTextFromHtml,
  extractAmount,
  extractAccountLast4,
  extractBalance,
  extractPaymentMethod,
  crossValidate,
};
