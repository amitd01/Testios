const Transaction = require('../models/Transaction');

/**
 * Deduplication & Harmonization Engine
 * Matches transactions from multiple sources (alert emails + PDF statements)
 */
async function deduplicateTransactions(userId) {
  const startTime = Date.now();
  const rawTxns = await Transaction.getUnprocessedRaw(userId);
  if (rawTxns.length === 0) return { harmonized: [], stats: { input: 0, output: 0, merged: 0, duration_ms: Date.now() - startTime } };

  // Sort by trust (statement_pdf > email_alert)
  const sorted = [...rawTxns].sort((a, b) => {
    const trustA = getTrustScore(a.source);
    const trustB = getTrustScore(b.source);
    return trustB - trustA;
  });

  const harmonized = [];
  const matched = new Set();
  let mergedCount = 0;

  for (const txn of sorted) {
    if (matched.has(txn.id)) continue;

    // Find potential duplicates
    const duplicates = sorted.filter(other =>
      !matched.has(other.id) &&
      other.id !== txn.id &&
      isSameTransaction(txn, other)
    );

    const sources = [txn.source];
    const rawIds = [txn.id];

    for (const dup of duplicates) {
      sources.push(dup.source);
      rawIds.push(dup.id);
      matched.add(dup.id);
    }

    if (duplicates.length > 0) mergedCount += duplicates.length;

    // Merge data from multiple sources
    const merged = mergeTransactionData(txn, duplicates);

    harmonized.push({
      user_id: userId,
      amount: merged.amount,
      date: merged.date,
      merchant: merged.merchant,
      merchant_detail: merged.merchantDetail,
      category: merged.category || txn.category || 'Uncategorized',
      account_last4: merged.accountLast4,
      account_type: merged.accountType,
      instrument_type: merged.instrumentType,
      financial_type: merged.financialType,
      account_id: merged.accountId,
      transaction_type: merged.transactionType,
      sources: [...new Set(sources)],
      verified: sources.length > 1,
      trust_score: Math.max(...sources.map(getTrustScore)),
      raw_transaction_ids: rawIds,
      metadata: merged.metadata,
    });

    matched.add(txn.id);
  }

  // Insert harmonized transactions
  const results = [];
  for (const txn of harmonized) {
    const result = await Transaction.insertHarmonized(txn);
    results.push(result);
  }

  const duration_ms = Date.now() - startTime;
  return {
    harmonized: results,
    stats: { input: rawTxns.length, output: harmonized.length, merged: mergedCount, duration_ms },
  };
}

function isSameTransaction(a, b) {
  // Same amount (absolute value)
  if (Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) > 0.01) return false;

  // Date within ±1 day
  const dateA = new Date(a.date);
  const dateB = new Date(b.date);
  const daysDiff = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
  if (daysDiff > 1) return false;

  // Same account (if both have last 4 digits)
  if (a.account_last4 && b.account_last4 && a.account_last4 !== b.account_last4) return false;

  // Same transaction direction
  if (a.transaction_type && b.transaction_type && a.transaction_type !== b.transaction_type) return false;

  // Different instrument types = NOT a duplicate
  // e.g., same amount on savings and credit card on same day are separate transactions
  if (a.instrument_type && b.instrument_type && a.instrument_type !== b.instrument_type) return false;

  return true;
}

function mergeTransactionData(primary, duplicates) {
  // Primary is already highest trust score
  let merchant = primary.merchant;
  let merchantDetail = null;
  let accountLast4 = primary.account_last4;
  let accountType = primary.account_type;
  let instrumentType = primary.instrument_type;
  let financialType = primary.financial_type;
  let accountId = primary.account_id;

  for (const dup of duplicates) {
    // Prefer longer/more specific merchant names from alerts
    if (dup.merchant && dup.merchant.length > (merchant || '').length) {
      merchantDetail = dup.merchant;
    }
    // Fill in missing account info
    if (!accountLast4 && dup.account_last4) accountLast4 = dup.account_last4;
    if (!accountType && dup.account_type) accountType = dup.account_type;
    if (!instrumentType && dup.instrument_type) instrumentType = dup.instrument_type;
    if (!financialType && dup.financial_type) financialType = dup.financial_type;
    if (!accountId && dup.account_id) accountId = dup.account_id;
  }

  return {
    amount: primary.amount,
    date: primary.date,
    merchant: merchant || 'Unknown',
    merchantDetail,
    category: primary.category,
    accountLast4,
    accountType: accountType || 'savings',
    instrumentType,
    financialType,
    accountId,
    transactionType: primary.transaction_type,
    metadata: {
      ...(primary.metadata || {}),
      duplicateCount: duplicates.length,
    },
  };
}

function getTrustScore(source) {
  const scores = {
    'statement_pdf': 100,
    'statement_excel': 95,
    'email_alert': 80,
    'bill_reminder': 70,
  };
  return scores[source] || 50;
}

module.exports = { deduplicateTransactions, isSameTransaction };
