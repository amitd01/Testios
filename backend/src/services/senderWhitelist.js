/**
 * Institutional email sender whitelist
 * Only emails from these domains are processed
 */

const SENDER_WHITELIST = {
  // Banks
  'hdfcbank.net': { name: 'HDFC Bank', type: 'bank' },
  'hdfcbank.com': { name: 'HDFC Bank', type: 'bank' },
  'icicibank.com': { name: 'ICICI Bank', type: 'bank' },
  'sbi.co.in': { name: 'SBI', type: 'bank' },
  'axisbank.com': { name: 'Axis Bank', type: 'bank' },
  'kotak.com': { name: 'Kotak Mahindra Bank', type: 'bank' },
  'kotakbank.com': { name: 'Kotak Mahindra Bank', type: 'bank' },
  'yesbank.in': { name: 'Yes Bank', type: 'bank' },
  'indusind.com': { name: 'IndusInd Bank', type: 'bank' },
  'federalbank.co.in': { name: 'Federal Bank', type: 'bank' },
  'idbibank.co.in': { name: 'IDBI Bank', type: 'bank' },
  'bankofbaroda.co.in': { name: 'Bank of Baroda', type: 'bank' },
  'pnb.co.in': { name: 'PNB', type: 'bank' },
  'canarabank.com': { name: 'Canara Bank', type: 'bank' },
  'unionbankofindia.co.in': { name: 'Union Bank', type: 'bank' },

  // Credit Cards
  'cards.hdfcbank.com': { name: 'HDFC Card', type: 'credit_card' },
  'icicibankcard.com': { name: 'ICICI Card', type: 'credit_card' },
  'sbicard.com': { name: 'SBI Card', type: 'credit_card' },
  'axiscard.com': { name: 'Axis Card', type: 'credit_card' },

  // UPI / Payment Apps
  'phonepe.com': { name: 'PhonePe', type: 'upi' },
  'paytm.com': { name: 'Paytm', type: 'upi' },
  'google.com': { name: 'Google Pay', type: 'upi' },
  'amazonpay.in': { name: 'Amazon Pay', type: 'upi' },

  // Investment
  'camsonline.com': { name: 'CAMS', type: 'investment' },
  'kfintech.com': { name: 'KFintech', type: 'investment' },
  'cdslindia.com': { name: 'CDSL', type: 'investment' },
  'nsdl.co.in': { name: 'NSDL', type: 'investment' },
  'zerodha.com': { name: 'Zerodha', type: 'investment' },
  'groww.in': { name: 'Groww', type: 'investment' },

  // Billers
  'bescom.co.in': { name: 'BESCOM', type: 'biller' },
  'bescom.org': { name: 'BESCOM', type: 'biller' },
  'mahadiscom.in': { name: 'MSEDCL', type: 'biller' },
  'tatapower.com': { name: 'Tata Power', type: 'biller' },
  'airtel.in': { name: 'Airtel', type: 'biller' },
  'airtel.com': { name: 'Airtel', type: 'biller' },
  'jio.com': { name: 'Jio', type: 'biller' },
  'vodafone.in': { name: 'Vodafone', type: 'biller' },
  'bsnl.co.in': { name: 'BSNL', type: 'biller' },
  'licindia.in': { name: 'LIC', type: 'biller' },
  'hdfclife.com': { name: 'HDFC Life', type: 'biller' },
  'iciciprulife.com': { name: 'ICICI Prudential', type: 'biller' },
  'netflix.com': { name: 'Netflix', type: 'biller' },
  'amazon.in': { name: 'Amazon', type: 'biller' },
  'spotify.com': { name: 'Spotify', type: 'biller' },
};

function getDomainFromEmail(email) {
  if (!email) return null;
  const match = email.match(/@(.+)$/);
  return match ? match[1].toLowerCase() : null;
}

function isWhitelistedSender(senderEmail) {
  const domain = getDomainFromEmail(senderEmail);
  if (!domain) return false;

  // Check exact domain match or parent domain match
  if (SENDER_WHITELIST[domain]) return true;

  // Check if it's a subdomain of a whitelisted domain
  for (const whitelistedDomain of Object.keys(SENDER_WHITELIST)) {
    if (domain.endsWith('.' + whitelistedDomain)) return true;
  }

  return false;
}

function getSenderInfo(senderEmail) {
  const domain = getDomainFromEmail(senderEmail);
  if (!domain) return null;

  if (SENDER_WHITELIST[domain]) return SENDER_WHITELIST[domain];

  for (const [whitelistedDomain, info] of Object.entries(SENDER_WHITELIST)) {
    if (domain.endsWith('.' + whitelistedDomain)) return info;
  }

  return null;
}

function getGmailSearchQuery() {
  const domains = Object.keys(SENDER_WHITELIST);
  const fromClauses = domains.map(d => `from:*@${d}`).join(' OR ');
  return `{${fromClauses}}`;
}

module.exports = {
  SENDER_WHITELIST,
  getDomainFromEmail,
  isWhitelistedSender,
  getSenderInfo,
  getGmailSearchQuery,
};
