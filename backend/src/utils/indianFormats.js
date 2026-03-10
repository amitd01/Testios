/**
 * India-specific formatting utilities
 */

/**
 * Format number in Indian numbering system (₹1,00,000)
 */
function formatINR(amount) {
  if (amount == null) return '₹0';
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const [intPart, decPart] = absAmount.toFixed(2).split('.');

  // Indian grouping: last 3 digits, then groups of 2
  let result = '';
  const digits = intPart.split('');
  if (digits.length <= 3) {
    result = intPart;
  } else {
    const last3 = digits.splice(-3).join('');
    // Group remaining digits in pairs
    const remaining = digits.join('');
    const pairs = [];
    for (let i = remaining.length; i > 0; i -= 2) {
      pairs.unshift(remaining.substring(Math.max(0, i - 2), i));
    }
    result = pairs.join(',') + ',' + last3;
  }

  return (isNegative ? '-' : '') + '₹' + result + '.' + decPart;
}

/**
 * Parse Indian date formats: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY
 */
function parseIndianDate(dateStr) {
  if (!dateStr) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // DD MMM YYYY (e.g., "17 Mar 2026")
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const wordMatch = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (wordMatch) {
    const [, day, monthStr, year] = wordMatch;
    const month = months[monthStr.toLowerCase()];
    if (month) return `${year}-${month}-${day.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Format date for Indian display: "17 Mar 2026"
 */
function formatIndianDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Parse Indian currency amounts: ₹520.00, Rs 520.00, Rs. 520, INR 520
 */
function parseINRAmount(text) {
  if (!text) return null;
  const match = text.match(/(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  return null;
}

module.exports = { formatINR, parseIndianDate, formatIndianDate, parseINRAmount };
