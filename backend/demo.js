#!/usr/bin/env node
/**
 * PFM Demo — processes sample Indian bank emails end-to-end
 */

const { parseTransactionAlert } = require('./src/parsers/htmlAlertParser');
const { parseBillReminder } = require('./src/parsers/billReminderParser');
const { categorizeTransaction, getAllCategories } = require('./src/services/categorizationEngine');
const { isWhitelistedSender, getSenderInfo, getGmailSearchQuery } = require('./src/services/senderWhitelist');
const { isSameTransaction } = require('./src/services/deduplicationEngine');
const { formatINR, parseIndianDate, formatIndianDate } = require('./src/utils/indianFormats');

// ─── Sample emails ───────────────────────────────────────────────

const sampleEmails = [
  {
    sender: 'alerts@hdfcbank.net',
    subject: 'Transaction Alert - Account Debited',
    body: `<html><body>
      <p>Dear Customer,</p>
      <p>Your a/c XX4523 has been debited for Rs.2,450.00 on 10-03-2026
      by UPI ref 789456123 to SWIGGY. Avl bal: Rs.45,320.50</p>
    </body></html>`,
  },
  {
    sender: 'alerts@icicibank.com',
    subject: 'Credit Alert',
    body: `<html><body>
      <p>Rs.75,000.00 credited to your a/c XX8891 on 01-03-2026
      via NEFT from ACME CORP PVT LTD. Balance: Rs.1,23,456.78</p>
    </body></html>`,
  },
  {
    sender: 'alerts@sbibank.co.in',
    subject: 'UPI Transaction',
    body: `<html><body>
      <p>Dear Customer, Your Account XX6712 has been debited by Rs.350.00 on 09-03-2026
      by a UPI txn for ZOMATO. UPI Ref No 456789012. If not done by you, call 1800-111.</p>
    </body></html>`,
  },
  {
    sender: 'creditcards@hdfcbank.net',
    subject: 'Credit Card Transaction Alert',
    body: `<html><body>
      <p>Your HDFC Bank Credit Card XX9087 has been used for a transaction of
      INR 5,999.00 at AMAZON IN on 08-03-2026.</p>
    </body></html>`,
  },
  {
    sender: 'alerts@axisbank.com',
    subject: 'IMPS Transfer Alert',
    body: `<html><body>
      <p>INR 12,500.00 debited from A/c XX3344 on 07-03-2026 via IMPS
      to BHARTI AIRTEL. Avl Bal: Rs.87,650.25</p>
    </body></html>`,
  },
];

const sampleBills = [
  {
    sender: 'billing@bescom.co.in',
    subject: 'Electricity Bill for March 2026',
    body: `<html><body>
      <p>Dear Consumer, Your BESCOM electricity bill for consumer no RR1234567
      is Rs.1,850.00. Due date: 25-03-2026. Pay online to avoid penalty.</p>
    </body></html>`,
  },
  {
    sender: 'bills@airtel.in',
    subject: 'Your Airtel Postpaid Bill',
    body: `<html><body>
      <p>Hi, Your Airtel postpaid bill for mobile 98765XXXXX is Rs.699.00.
      Due date: 20-03-2026. Auto-pay is enabled.</p>
    </body></html>`,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────

const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN  = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED   = '\x1b[31m';
const RESET = '\x1b[0m';

function hr(label) {
  const line = '─'.repeat(60);
  console.log(`\n${CYAN}${line}${RESET}`);
  if (label) console.log(`${BOLD}${label}${RESET}`);
  console.log(`${CYAN}${line}${RESET}`);
}

function bullet(key, value) {
  console.log(`  ${DIM}${key}:${RESET} ${value}`);
}

// ─── 1. Sender Whitelist ─────────────────────────────────────────

hr('1. SENDER WHITELIST CHECK');
console.log();
for (const email of sampleEmails) {
  const ok = isWhitelistedSender(email.sender);
  const info = getSenderInfo(email.sender);
  const icon = ok ? `${GREEN}✔${RESET}` : `${RED}✘${RESET}`;
  console.log(`  ${icon}  ${email.sender}  →  ${info ? info.name + ' (' + info.type + ')' : 'unknown'}`);
}
console.log();
console.log(`  ${DIM}Spam check:${RESET}`);
for (const fake of ['promo@randomshop.com', 'newsletter@medium.com']) {
  const ok = isWhitelistedSender(fake);
  const icon = ok ? `${GREEN}✔${RESET}` : `${RED}✘${RESET}`;
  console.log(`  ${icon}  ${fake}  →  ${ok ? 'whitelisted' : 'rejected (not a known institution)'}`);
}

// ─── 2. Parse Transaction Alerts ─────────────────────────────────

hr('2. PARSE TRANSACTION ALERTS');
const parsedTxns = [];
for (const email of sampleEmails) {
  const txn = parseTransactionAlert(email.body, email.sender, email.subject);
  if (txn) {
    parsedTxns.push(txn);
    console.log();
    const typeColor = txn.transaction_type === 'debit' ? RED : GREEN;
    console.log(`  ${BOLD}${email.subject}${RESET}`);
    bullet('Amount', `${typeColor}${formatINR(txn.amount)}${RESET}`);
    bullet('Type', txn.transaction_type);
    bullet('Date', txn.date ? formatIndianDate(txn.date) : 'N/A');
    bullet('Account', `XX${txn.account_last4 || '????'}`);
    bullet('Merchant', txn.merchant || 'N/A');
    bullet('Method', txn.payment_method || 'N/A');
    if (txn.balance_after) bullet('Balance', formatINR(txn.balance_after));
  }
}

// ─── 3. Parse Bill Reminders ─────────────────────────────────────

hr('3. PARSE BILL REMINDERS');
const parsedBills = [];
for (const email of sampleBills) {
  const bill = parseBillReminder(email.body, email.sender, email.subject);
  if (bill) {
    parsedBills.push(bill);
    console.log();
    console.log(`  ${BOLD}${email.subject}${RESET}`);
    bullet('Biller', bill.biller_name);
    bullet('Type', bill.bill_type);
    bullet('Amount', `${YELLOW}${formatINR(bill.amount)}${RESET}`);
    bullet('Due Date', bill.due_date ? formatIndianDate(bill.due_date) : 'N/A');
    if (bill.account_number) bullet('Account #', bill.account_number);
  }
}

// ─── 4. Auto-Categorization ─────────────────────────────────────

hr('4. AUTO-CATEGORIZATION');
console.log();
for (const txn of parsedTxns) {
  const category = categorizeTransaction(txn.merchant);
  const label = txn.merchant || '(unknown)';
  console.log(`  ${label.padEnd(25)} → ${BOLD}${category}${RESET}`);
}

console.log(`\n  ${DIM}All categories: ${getAllCategories().join(', ')}${RESET}`);

// ─── 5. Deduplication ────────────────────────────────────────────

hr('5. DEDUPLICATION CHECK');
console.log();

// Simulate a duplicate: same Swiggy txn from email alert + statement
const alertTxn = {
  amount: -2450,
  date: '2026-03-10',
  account_last4: '4523',
  transaction_type: 'debit',
  merchant: 'SWIGGY',
  source: 'email_alert',
};
const statementTxn = {
  amount: -2450,
  date: '2026-03-10',
  account_last4: '4523',
  transaction_type: 'debit',
  merchant: 'SWIGGY FOOD ORDER',
  source: 'statement_pdf',
};
const differentTxn = {
  amount: -350,
  date: '2026-03-09',
  account_last4: '6712',
  transaction_type: 'debit',
  merchant: 'ZOMATO',
  source: 'email_alert',
};

const dup1 = isSameTransaction(alertTxn, statementTxn);
const dup2 = isSameTransaction(alertTxn, differentTxn);

console.log(`  Email alert ₹2,450 SWIGGY  vs  Statement ₹2,450 SWIGGY`);
console.log(`  → ${dup1 ? GREEN + 'DUPLICATE detected — will merge' : RED + 'Not a duplicate'}${RESET}`);
console.log();
console.log(`  Email alert ₹2,450 SWIGGY  vs  Email alert ₹350 ZOMATO`);
console.log(`  → ${dup2 ? GREEN + 'DUPLICATE' : YELLOW + 'UNIQUE — kept as separate transaction'}${RESET}`);

// ─── 6. Indian Formatting ────────────────────────────────────────

hr('6. INDIAN FORMAT UTILITIES');
console.log();
const amounts = [500, 9999, 100000, 1500000, 25000000];
for (const amt of amounts) {
  console.log(`  ${String(amt).padStart(12)}  →  ${formatINR(amt)}`);
}
console.log();
const dates = ['10/03/2026', '01-03-2026', '25 Mar 2026'];
for (const d of dates) {
  const parsed = parseIndianDate(d);
  console.log(`  "${d}"  →  parsed: ${parsed}  →  display: ${formatIndianDate(parsed)}`);
}

// ─── 7. Gmail Search Query ───────────────────────────────────────

hr('7. GMAIL SEARCH QUERY (auto-generated)');
console.log();
const query = getGmailSearchQuery();
// wrap long line
const wrapped = query.replace(/(.{70,}?) /g, '$1\n    ');
console.log(`  ${DIM}${wrapped}${RESET}`);

// ─── Summary ─────────────────────────────────────────────────────

hr('SUMMARY');
console.log();
console.log(`  Transactions parsed : ${GREEN}${parsedTxns.length}${RESET}`);
console.log(`  Bills parsed        : ${GREEN}${parsedBills.length}${RESET}`);
console.log(`  Categories available: ${getAllCategories().length}`);
console.log(`  Duplicates caught   : ${dup1 ? 1 : 0}`);
console.log();
console.log(`  ${GREEN}${BOLD}All systems operational ✔${RESET}`);
console.log();
