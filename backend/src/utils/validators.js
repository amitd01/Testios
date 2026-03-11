/**
 * Data validation layer for parsed financial data
 */

function validateAmount(amount) {
  if (amount === null || amount === undefined) return { valid: false, reason: 'missing' };
  if (typeof amount !== 'number' || isNaN(amount)) return { valid: false, reason: 'not_a_number' };
  if (amount === 0) return { valid: false, reason: 'zero' };
  if (Math.abs(amount) > 10000000) return { valid: false, reason: 'exceeds_1_crore' };
  return { valid: true };
}

function validateDate(dateStr) {
  if (!dateStr) return { valid: false, reason: 'missing' };
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { valid: false, reason: 'invalid_date' };

  const now = new Date();
  if (date > now) return { valid: false, reason: 'future_date' };

  const earliest = new Date('2020-01-01');
  if (date < earliest) return { valid: false, reason: 'too_old' };

  return { valid: true };
}

function validateAccountLast4(str) {
  if (!str) return { valid: false, reason: 'missing' };
  if (!/^\d{4}$/.test(str)) return { valid: false, reason: 'not_4_digits' };
  return { valid: true };
}

module.exports = { validateAmount, validateDate, validateAccountLast4 };
