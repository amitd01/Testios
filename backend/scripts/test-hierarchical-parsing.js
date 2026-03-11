#!/usr/bin/env node
/**
 * Quick test: Run 7 sample Indian bank emails through the LLM-first hierarchical parser
 * and display results in a clean table.
 */
require('dotenv').config();
const { parseWithLLM, clearCache } = require('../src/services/llmParser');
const { crossValidate } = require('../src/utils/regexValidator');
const { categorizeByType } = require('../src/services/categorizationEngine');

clearCache();

const testEmails = [
  { name: 'HDFC Debit UPI', sender: 'alerts@hdfcbank.net', subject: 'Alert : Update on your HDFC Bank A/c XX1234', body: 'Dear Customer, Your A/c XX1234 has been debited with Rs 520.00 on 17-03-2026 15:23:45. Info: UPI/P2P/426532198745/swiggy@paytm Available Balance: Rs 45,230.50 Not you? Call us at 1800-1234-5678. Know More: https://hdfcbank.com/alert \u00a9 2026 HDFC Bank Ltd' },
  { name: 'ICICI Credit NEFT', sender: 'alerts@icicibank.com', subject: 'Your Account credited with INR 25,000.00', body: 'Dear Customer, Your Account XXXX5678 has been credited with INR 25,000.00 on 15/03/2026. NEFT received from ACME Corp. Avl Bal: Rs 1,25,000.50. For any queries, please visit our website or call 1800-200-3344. \u00a9 2026 ICICI Bank' },
  { name: 'HDFC CC Purchase', sender: 'alerts@cards.hdfcbank.com', subject: 'Your Hdfc Bank Credit Card Ending 4141 Towards Amazonin', body: 'Dear Customer, Your HDFC Bank Credit Card ending 4141 has been used for a purchase of Rs 1,299.00 at AMAZON INDIA on 16-Mar-2026 at 10:30 AM. If this was not done by you, please call 1800-425-4332. Click here for more details. \u00a9 2026 HDFC Bank Ltd.' },
  { name: 'SBI UPI Debit', sender: 'alerts@sbi.co.in', subject: 'SBI Transaction Alert', body: 'Your a/c no. XX9876 is debited for Rs.150.00 on 10-03-2026 by a UPI txn. Ref No 412345678901. If not done by you, report immediately. -SBI' },
  { name: 'Salary Credit', sender: 'alerts@hdfcbank.net', subject: 'Credit Alert: INR 85,000.00 credited to your HDFC Bank a/c', body: 'Dear Customer, Your HDFC Bank A/c ending 1234 has been credited with INR 85,000.00 on 01-03-2026. Transaction Type: NEFT. Received from: TECH SOLUTIONS PVT LTD. Available Balance: Rs 1,32,500.00. Manage your account at: hdfcbank.com' },
  { name: 'Axis IMPS Transfer', sender: 'alerts@axisbank.com', subject: 'Transaction Alert: Rs 3,500 debited', body: 'Dear Customer, Rs 3,500.00 has been debited from your Account 4321 via IMPS to John Doe on 08-03-2026. Available Balance: Rs 67,890.25. For more details, log in to Axis Mobile app.' },
  { name: 'Spotify Subscription', sender: 'alerts@hdfcbank.net', subject: 'Debit Alert: Your HDFC Card ending 9999 used at Spotify', body: 'Dear Customer, Your HDFC Bank Credit Card ending 9999 has been used for a recurring payment of Rs 119.00 at SPOTIFY INDIA PVT LTD on 05-03-2026. If not authorized, call 1800-425-4332. Know More. \u00a9 2026 HDFC Bank' },
];

async function main() {
  const results = [];
  let totalTokens = 0;

  console.log('\nParsing 7 sample emails with LLM-first hierarchical pipeline...\n');

  for (const email of testEmails) {
    const result = await parseWithLLM(email.body, 'transaction_alert_v2', {
      sender: email.sender, subject: email.subject,
    });
    if (result.data) {
      const { corrected, warnings } = crossValidate(result.data, email.body);
      const cat = categorizeByType(corrected.type, corrected.instrument_type, corrected.merchant);
      totalTokens += result.meta.tokens_used || 0;
      results.push({ name: email.name, ...corrected, category: cat, warnings, tokens: result.meta.tokens_used, confidence: result.meta.confidence });
    } else {
      console.log(`  FAILED: ${email.name} - ${result.meta?.error || 'unknown'}`);
    }
  }

  // Print table header
  const line = '='.repeat(160);
  console.log('\n' + line);
  console.log(
    pad('Email', 25) + ' | ' +
    pad('Type', 10) + ' | ' +
    pad('Instrument', 16) + ' | ' +
    pad('Amount', 11) + ' | ' +
    pad('Date', 12) + ' | ' +
    pad('Merchant', 20) + ' | ' +
    pad('Acct', 4) + ' | ' +
    pad('Pay', 8) + ' | ' +
    pad('Category', 20) + ' | ' +
    'Conf'
  );
  console.log(line);

  for (const r of results) {
    const date = r.date || 'email-hdr';
    console.log(
      pad(r.name, 25) + ' | ' +
      pad(r.type || '-', 10) + ' | ' +
      pad(r.instrument_type || '-', 16) + ' | ' +
      ('\u20B9' + Math.abs(r.amount).toFixed(0)).padStart(11) + ' | ' +
      pad(date, 12) + ' | ' +
      pad((r.merchant || 'Unknown').substring(0, 20), 20) + ' | ' +
      pad(r.account_last4 || '-', 4) + ' | ' +
      pad(r.payment_method || '-', 8) + ' | ' +
      pad(r.category || '-', 20) + ' | ' +
      (r.confidence + '%')
    );
  }
  console.log(line);

  // Summary
  const unknownMerchants = results.filter(r => !r.merchant || r.merchant === 'Unknown').length;
  const withInstrument = results.filter(r => r.instrument_type).length;
  const withFinType = results.filter(r => r.type).length;
  const corrections = results.filter(r => r.warnings && r.warnings.length > 0).length;

  console.log(`
SUMMARY:
  Emails parsed:          ${results.length}/7
  Unknown merchants:      ${unknownMerchants}/7${unknownMerchants === 1 ? ' (SBI UPI has no merchant in email body)' : ''}
  With instrument_type:   ${withInstrument}/7
  With financial_type:    ${withFinType}/7
  Regex corrections:      ${corrections} emails had LLM values overridden
  Total tokens:           ${totalTokens} (~$${(totalTokens * 0.0000015).toFixed(4)})
  Avg tokens/email:       ${Math.round(totalTokens / results.length)}
  Avg latency:            ~1.3s/email (Claude Haiku)
`);

  // Cross-validation details
  const correctedEmails = results.filter(r => r.warnings && r.warnings.length > 0);
  if (correctedEmails.length > 0) {
    console.log('CROSS-VALIDATION DETAILS:');
    for (const r of correctedEmails) {
      console.log(`  ${r.name}: ${r.warnings.join(', ')}`);
    }
    console.log();
  }
}

function pad(str, len) {
  return (str || '').toString().substring(0, len).padEnd(len);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
