const { validateAmount, validateDate, validateAccountLast4 } = require('./validators');

/**
 * Compute a 0-100 confidence score for a parsed transaction
 */
function scoreTransaction(parsed, { llmUsed = false, regexAgreed = false } = {}) {
  let score = 0;
  const warnings = [];

  // Amount: +30
  const amountValid = validateAmount(parsed.amount);
  if (amountValid.valid) {
    score += 30;
  } else {
    warnings.push(`amount_${amountValid.reason}`);
  }

  // Date: +20
  const dateValid = validateDate(parsed.date);
  if (dateValid.valid) {
    score += 20;
  } else {
    warnings.push(`date_${dateValid.reason}`);
  }

  // Check for ambiguous date (DD/MM vs MM/DD)
  if (parsed.date) {
    const d = new Date(parsed.date);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    if (day <= 12 && month <= 12 && day !== month) {
      score -= 10;
      warnings.push('date_ambiguous');
    }
  }

  // Merchant: +20 (not "Unknown")
  if (parsed.merchant && parsed.merchant !== 'Unknown') {
    score += 20;
  } else {
    warnings.push('merchant_unknown');
  }

  // Account last 4: +15
  const acctValid = validateAccountLast4(parsed.account_last4);
  if (acctValid.valid) {
    score += 15;
  }

  // Balance after: +10
  if (parsed.balance_after !== null && parsed.balance_after !== undefined) {
    score += 10;
  }

  // Transaction type: +5
  if (parsed.transaction_type && ['debit', 'credit'].includes(parsed.transaction_type)) {
    score += 5;
  }

  // Bonus: LLM + regex agree
  if (regexAgreed) {
    score += 15;
    warnings.push('llm_regex_agree');
  }

  // Penalty: LLM-only with low base
  if (llmUsed && !regexAgreed && score < 50) {
    score -= 10;
    warnings.push('llm_only_low_confidence');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    warnings,
  };
}

module.exports = { scoreTransaction };
