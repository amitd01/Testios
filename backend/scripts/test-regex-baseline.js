#!/usr/bin/env node
/**
 * Baseline: Run the same 7 emails through the OLD regex-first parser for comparison.
 */
require('dotenv').config();
const { parseTransactionAlert } = require('../src/parsers/htmlAlertParser');
const { categorizeTransaction } = require('../src/services/categorizationEngine');

const testEmails = [
  { name: 'HDFC Debit UPI', sender: 'alerts@hdfcbank.net', subject: 'Alert : Update on your HDFC Bank A/c XX1234', body: 'Dear Customer, Your A/c XX1234 has been debited with Rs 520.00 on 17-03-2026 15:23:45. Info: UPI/P2P/426532198745/swiggy@paytm Available Balance: Rs 45,230.50 Not you? Call us at 1800-1234-5678. Know More: https://hdfcbank.com/alert \u00a9 2026 HDFC Bank Ltd' },
  { name: 'ICICI Credit NEFT', sender: 'alerts@icicibank.com', subject: 'Your Account credited with INR 25,000.00', body: 'Dear Customer, Your Account XXXX5678 has been credited with INR 25,000.00 on 15/03/2026. NEFT received from ACME Corp. Avl Bal: Rs 1,25,000.50. For any queries, please visit our website or call 1800-200-3344. \u00a9 2026 ICICI Bank' },
  { name: 'HDFC CC Purchase', sender: 'alerts@cards.hdfcbank.com', subject: 'Your Hdfc Bank Credit Card Ending 4141 Towards Amazonin', body: 'Dear Customer, Your HDFC Bank Credit Card ending 4141 has been used for a purchase of Rs 1,299.00 at AMAZON INDIA on 16-Mar-2026 at 10:30 AM. If this was not done by you, please call 1800-425-4332. Click here for more details. \u00a9 2026 HDFC Bank Ltd.' },
  { name: 'SBI UPI Debit', sender: 'alerts@sbi.co.in', subject: 'SBI Transaction Alert', body: 'Your a/c no. XX9876 is debited for Rs.150.00 on 10-03-2026 by a UPI txn. Ref No 412345678901. If not done by you, report immediately. -SBI' },
  { name: 'Salary Credit', sender: 'alerts@hdfcbank.net', subject: 'Credit Alert: INR 85,000.00 credited to your HDFC Bank a/c', body: 'Dear Customer, Your HDFC Bank A/c ending 1234 has been credited with INR 85,000.00 on 01-03-2026. Transaction Type: NEFT. Received from: TECH SOLUTIONS PVT LTD. Available Balance: Rs 1,32,500.00. Manage your account at: hdfcbank.com' },
  { name: 'Axis IMPS Transfer', sender: 'alerts@axisbank.com', subject: 'Transaction Alert: Rs 3,500 debited', body: 'Dear Customer, Rs 3,500.00 has been debited from your Account 4321 via IMPS to John Doe on 08-03-2026. Available Balance: Rs 67,890.25. For more details, log in to Axis Mobile app.' },
  { name: 'Spotify Subscription', sender: 'alerts@hdfcbank.net', subject: 'Debit Alert: Your HDFC Card ending 9999 used at Spotify', body: 'Dear Customer, Your HDFC Bank Credit Card ending 9999 has been used for a recurring payment of Rs 119.00 at SPOTIFY INDIA PVT LTD on 05-03-2026. If not authorized, call 1800-425-4332. Know More. \u00a9 2026 HDFC Bank' },
];

const line = '='.repeat(130);
console.log('\nREGEX-FIRST PARSER (old approach) results:\n');
console.log(line);
console.log(
  pad('Email', 22) + ' | ' +
  pad('Amount', 10) + ' | ' +
  pad('Date', 12) + ' | ' +
  pad('Merchant', 20) + ' | ' +
  pad('Acct', 4) + ' | ' +
  pad('Type', 6) + ' | ' +
  pad('Pay', 8) + ' | ' +
  pad('Category', 18) + ' | Conf'
);
console.log(line);

const allResults = [];
for (const email of testEmails) {
  const result = parseTransactionAlert(email.body, email.sender, email.subject);
  allResults.push(result);
  if (result.data) {
    const d = result.data;
    d.category = categorizeTransaction(d.merchant);
    console.log(
      pad(email.name, 22) + ' | ' +
      ('\u20B9' + Math.abs(d.amount).toFixed(0)).padStart(10) + ' | ' +
      pad(d.date || 'null', 12) + ' | ' +
      pad((d.merchant || 'Unknown').substring(0, 20), 20) + ' | ' +
      pad(d.account_last4 || '-', 4) + ' | ' +
      pad(d.transaction_type || '-', 6) + ' | ' +
      pad(d.payment_method || '-', 8) + ' | ' +
      pad(d.category || '-', 18) + ' | ' + result.meta.confidence + '%'
    );
  } else {
    console.log(pad(email.name, 22) + ' | FAILED (no amount)');
  }
}
console.log(line);

const unknownM = allResults.filter(r => r.data && (r.data.merchant == null || r.data.merchant === 'Unknown')).length;
console.log(`
SUMMARY (regex-first):
  Unknown merchants:      ${unknownM}/7
  No instrument_type:     7/7 (not supported)
  No financial_type:      7/7 (not supported)
  No date_source:         7/7 (not supported)
`);

function pad(str, len) {
  return (str || '').toString().substring(0, len).padEnd(len);
}
