/**
 * Format number in Indian numbering system (₹1,00,000.00)
 */
export function formatINR(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const [intPart, decPart] = absAmount.toFixed(2).split('.');

  let result = '';
  const digits = intPart.split('');
  if (digits.length <= 3) {
    result = intPart;
  } else {
    const last3 = digits.splice(-3).join('');
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
 * Short format: ₹1.5L, ₹2.3Cr
 */
export function formatINRShort(amount) {
  if (amount == null) return '₹0';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) return sign + '₹' + (abs / 10000000).toFixed(1) + 'Cr';
  if (abs >= 100000) return sign + '₹' + (abs / 100000).toFixed(1) + 'L';
  if (abs >= 1000) return sign + '₹' + (abs / 1000).toFixed(1) + 'K';
  return sign + '₹' + abs.toFixed(0);
}

/**
 * Format date as "17 Mar 2026"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Relative time: "2 hours ago", "Yesterday"
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export function getCategoryColor(category) {
  const colors = {
    'Food & Dining': '#FF6B6B',
    'Transportation': '#4ECDC4',
    'Bills & Utilities': '#F7A84F',
    'Shopping': '#A78BFA',
    'Entertainment': '#F472B6',
    'Healthcare': '#34D399',
    'Investments': '#60A5FA',
    'Loan Payments': '#F87171',
    'Insurance': '#FBBF24',
    'Education': '#818CF8',
    'Transfer': '#9CA3AF',
    'Cash Withdrawal': '#D1D5DB',
    'Salary': '#2DD882',
    'Rent': '#FB923C',
    'Personal Care': '#E879F9',
    'Gifts & Donations': '#F9A8D4',
    'Uncategorized': '#6B7280',
  };
  return colors[category] || '#6B7280';
}
