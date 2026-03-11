#!/usr/bin/env node
/**
 * Test script: Compare before vs after parsing results
 *
 * Usage:
 *   1. Run migration 003 first: node -e "require('./src/config/database').query(require('./src/migrations/003_instrument_types').UP)"
 *   2. Run this script: node scripts/test-reparse-comparison.js
 *
 * What it does:
 *   1. Captures current state of first 20 transactions (before)
 *   2. Triggers a re-parse with the new LLM-first hierarchical pipeline
 *   3. Captures new state of transactions (after)
 *   4. Prints side-by-side comparison
 */
require('dotenv').config();
const db = require('../src/config/database');
const EmailProcessingEngine = require('../src/services/emailProcessingEngine');

async function main() {
  try {
    // 1. Get user
    const users = await db.query('SELECT id, email FROM users LIMIT 1');
    if (users.rows.length === 0) {
      console.log('No users found. Complete OAuth first.');
      process.exit(1);
    }
    const userId = users.rows[0].id;
    console.log(`\nUser: ${users.rows[0].email}`);

    // 2. Capture BEFORE state (first 20 raw_transactions)
    const beforeTxns = await db.query(
      `SELECT rt.id, rt.amount, rt.date, rt.merchant, rt.account_last4, rt.account_type,
              rt.transaction_type, rt.payment_method, rt.category, rt.instrument_type, rt.financial_type,
              re.subject, re.sender
       FROM raw_transactions rt
       JOIN raw_emails re ON rt.email_id = re.id
       WHERE rt.user_id = $1
       ORDER BY rt.created_at DESC
       LIMIT 20`,
      [userId]
    );

    console.log(`\n${'='.repeat(100)}`);
    console.log('BEFORE STATE (current parsing results)');
    console.log('='.repeat(100));
    console.log(`Found ${beforeTxns.rows.length} raw transactions\n`);

    const beforeMap = {};
    for (const txn of beforeTxns.rows) {
      beforeMap[txn.id] = txn;
      console.log(`  ${txn.date} | ${(txn.merchant || 'Unknown').padEnd(25)} | ₹${Math.abs(txn.amount).toFixed(2).padStart(10)} | ${(txn.transaction_type || '-').padEnd(6)} | ${(txn.account_type || '-').padEnd(12)} | ${(txn.category || '-').padEnd(18)} | ${(txn.instrument_type || '-').padEnd(16)} | ${(txn.financial_type || '-')}`);
    }

    // 3. Get email count to re-parse
    const emailCount = await db.query(
      `SELECT COUNT(*) as count FROM raw_emails WHERE user_id = $1 AND email_category IN ('transaction_alert', 'bill_reminder')`,
      [userId]
    );
    console.log(`\nEmails to re-parse: ${emailCount.rows[0].count}`);

    // 4. Run re-parse
    console.log(`\n${'='.repeat(100)}`);
    console.log('RUNNING RE-PARSE WITH LLM-FIRST HIERARCHICAL PIPELINE...');
    console.log('='.repeat(100));

    const engine = new EmailProcessingEngine(userId);
    const stats = await engine.runReparse();
    console.log('\nRe-parse stats:', JSON.stringify(stats, null, 2));

    // 5. Capture AFTER state
    const afterTxns = await db.query(
      `SELECT rt.id, rt.amount, rt.date, rt.merchant, rt.account_last4, rt.account_type,
              rt.transaction_type, rt.payment_method, rt.category, rt.instrument_type, rt.financial_type,
              rt.date_source, rt.metadata,
              re.subject, re.sender
       FROM raw_transactions rt
       JOIN raw_emails re ON rt.email_id = re.id
       WHERE rt.user_id = $1
       ORDER BY rt.created_at DESC
       LIMIT 20`,
      [userId]
    );

    console.log(`\n${'='.repeat(100)}`);
    console.log('AFTER STATE (LLM-first hierarchical parsing results)');
    console.log('='.repeat(100));
    console.log(`Found ${afterTxns.rows.length} raw transactions\n`);

    for (const txn of afterTxns.rows) {
      console.log(`  ${txn.date} | ${(txn.merchant || 'Unknown').padEnd(25)} | ₹${Math.abs(txn.amount).toFixed(2).padStart(10)} | ${(txn.transaction_type || '-').padEnd(6)} | ${(txn.instrument_type || '-').padEnd(16)} | ${(txn.financial_type || '-').padEnd(16)} | ${(txn.category || '-').padEnd(18)} | date_src=${txn.date_source || '-'}`);
    }

    // 6. Summary comparison
    console.log(`\n${'='.repeat(100)}`);
    console.log('COMPARISON SUMMARY');
    console.log('='.repeat(100));

    const beforeUnknownMerchants = beforeTxns.rows.filter(t => !t.merchant || t.merchant === 'Unknown').length;
    const afterUnknownMerchants = afterTxns.rows.filter(t => !t.merchant || t.merchant === 'Unknown').length;

    const beforeNoInstrument = beforeTxns.rows.filter(t => !t.instrument_type).length;
    const afterNoInstrument = afterTxns.rows.filter(t => !t.instrument_type).length;

    const beforeNoFinType = beforeTxns.rows.filter(t => !t.financial_type).length;
    const afterNoFinType = afterTxns.rows.filter(t => !t.financial_type).length;

    const todayStr = new Date().toISOString().split('T')[0];
    const beforeTodayDates = beforeTxns.rows.filter(t => t.date && new Date(t.date).toISOString().split('T')[0] === todayStr).length;
    const afterTodayDates = afterTxns.rows.filter(t => t.date && new Date(t.date).toISOString().split('T')[0] === todayStr).length;

    console.log(`
  Metric                    | Before | After  | Change
  --------------------------|--------|--------|--------
  Unknown merchants         | ${String(beforeUnknownMerchants).padStart(6)} | ${String(afterUnknownMerchants).padStart(6)} | ${beforeUnknownMerchants - afterUnknownMerchants > 0 ? '↓' : beforeUnknownMerchants - afterUnknownMerchants < 0 ? '↑' : '='} ${Math.abs(beforeUnknownMerchants - afterUnknownMerchants)}
  Missing instrument_type   | ${String(beforeNoInstrument).padStart(6)} | ${String(afterNoInstrument).padStart(6)} | ${beforeNoInstrument - afterNoInstrument > 0 ? '↓' : '='}
  Missing financial_type    | ${String(beforeNoFinType).padStart(6)} | ${String(afterNoFinType).padStart(6)} | ${beforeNoFinType - afterNoFinType > 0 ? '↓' : '='}
  Dates showing today       | ${String(beforeTodayDates).padStart(6)} | ${String(afterTodayDates).padStart(6)} | ${beforeTodayDates - afterTodayDates > 0 ? '↓' : '='}
`);

    // Check for cross-validation warnings
    const warningCount = afterTxns.rows.filter(t => {
      const meta = typeof t.metadata === 'string' ? JSON.parse(t.metadata) : (t.metadata || {});
      return meta.cross_validation_warnings && meta.cross_validation_warnings.length > 0;
    }).length;
    console.log(`  Regex cross-validation corrections: ${warningCount} transactions had LLM values overridden by regex`);

    // Check LLM usage
    const llmStats = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE llm_used = true) as llm_used_count,
         SUM(llm_tokens_used) FILTER (WHERE llm_used = true) as total_tokens,
         AVG(confidence_score) as avg_confidence,
         COUNT(*) FILTER (WHERE parser_used = 'llm') as llm_primary_count,
         COUNT(*) FILTER (WHERE parser_used LIKE '%fallback%') as fallback_count
       FROM raw_emails WHERE user_id = $1 AND sync_run_id = $2`,
      [userId, engine.syncRunId]
    );
    const ls = llmStats.rows[0];
    console.log(`
  LLM Stats:
    Emails parsed with LLM: ${ls.llm_used_count || 0}
    Total tokens used: ${ls.total_tokens || 0}
    Average confidence: ${parseFloat(ls.avg_confidence || 0).toFixed(1)}%
    Regex fallback used: ${ls.fallback_count || 0} times
`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
