/**
 * Logical / Edge Case Tests (15 tests)
 *
 * Tests for data integrity, boundary conditions, and edge cases
 * that don't require HTTP but verify business logic correctness.
 */
const { mockQuery, resetDbMocks, mockQueryRows, mockQueryResponse } = require('../setup');
const Transaction = require('../../src/models/Transaction');
const Account = require('../../src/models/Account');

// Mock deduplication engine's isSameTransaction
let isSameTransaction;
try {
  const dedup = require('../../src/services/deduplicationEngine');
  isSameTransaction = dedup.isSameTransaction || dedup._isSameTransaction;
} catch (e) {
  // Will define inline if not exported
}

beforeEach(() => {
  resetDbMocks();
});

describe('Transaction amount handling', () => {
  test('negative amount stored correctly for debits', async () => {
    const txn = {
      user_id: '00000000-0000-0000-0000-000000000001',
      email_id: 'test-email-1',
      amount: -520.00,
      date: '2026-03-10',
      merchant: 'Swiggy',
      account_last4: '1234',
      account_type: 'savings',
      transaction_type: 'debit',
      payment_method: null,
      balance_after: null,
      category: 'Food & Dining',
      source: 'email_alert',
      metadata: {},
    };

    mockQueryResponse({ rows: [{ ...txn, id: 'new-id' }] });
    const result = await Transaction.insertRaw(txn);

    expect(result.amount).toBe(-520.00);
    // Verify the negative amount was passed to the query
    const callArgs = mockQuery.mock.calls[0][1];
    expect(callArgs[2]).toBe(-520.00); // amount is 3rd param
  });

  test('zero-amount transaction handled gracefully', async () => {
    mockQueryResponse({ rows: [{ id: 'zero-txn', amount: 0 }] });
    const result = await Transaction.insertRaw({
      user_id: '00000000-0000-0000-0000-000000000001',
      email_id: 'test-email-2',
      amount: 0,
      date: '2026-03-10',
      merchant: 'HDFC Bank',
      account_last4: '1234',
      account_type: 'savings',
      transaction_type: 'debit',
      category: 'Bills & Utilities',
      source: 'email_alert',
      metadata: { note: 'fee waiver' },
    });

    expect(result.amount).toBe(0);
  });

  test('large decimal amounts stored without overflow (₹99,99,99,999.99)', async () => {
    const largeAmount = 999999999.99;
    mockQueryResponse({ rows: [{ id: 'large-txn', amount: largeAmount }] });
    const result = await Transaction.insertRaw({
      user_id: '00000000-0000-0000-0000-000000000001',
      email_id: 'test-email-large',
      amount: largeAmount,
      date: '2026-03-10',
      merchant: 'Large Transfer',
      account_last4: '5678',
      account_type: 'savings',
      transaction_type: 'credit',
      category: 'Transfer',
      source: 'email_alert',
      metadata: {},
    });

    expect(result.amount).toBe(largeAmount);
    const callArgs = mockQuery.mock.calls[0][1];
    expect(callArgs[2]).toBe(largeAmount);
  });

  test('small decimal amount ₹0.01 stored correctly', async () => {
    mockQueryResponse({ rows: [{ id: 'small-txn', amount: 0.01 }] });
    const result = await Transaction.insertRaw({
      user_id: '00000000-0000-0000-0000-000000000001',
      email_id: 'test-email-small',
      amount: 0.01,
      date: '2026-03-10',
      merchant: 'Micro Payment',
      account_last4: '5678',
      account_type: 'savings',
      transaction_type: 'debit',
      category: 'Uncategorized',
      source: 'email_alert',
      metadata: {},
    });

    expect(result.amount).toBe(0.01);
  });
});

describe('Merchant name edge cases', () => {
  test('UTF-8 special characters preserved (Café Coffee Day)', async () => {
    const merchant = 'Café Coffee Day';
    mockQueryResponse({ rows: [{ id: 'utf8-txn', merchant }] });
    const result = await Transaction.insertRaw({
      user_id: '00000000-0000-0000-0000-000000000001',
      email_id: 'test-utf8',
      amount: -250,
      date: '2026-03-10',
      merchant,
      account_last4: '1234',
      account_type: 'savings',
      transaction_type: 'debit',
      category: 'Food & Dining',
      source: 'email_alert',
      metadata: {},
    });

    expect(result.merchant).toBe('Café Coffee Day');
    const callArgs = mockQuery.mock.calls[0][1];
    expect(callArgs[4]).toBe('Café Coffee Day'); // merchant is 5th param
  });

  test('ampersand in merchant name preserved (H&M)', async () => {
    const merchant = 'H&M';
    mockQueryResponse({ rows: [{ id: 'amp-txn', merchant }] });
    const result = await Transaction.insertRaw({
      user_id: '00000000-0000-0000-0000-000000000001',
      email_id: 'test-amp',
      amount: -3499,
      date: '2026-03-10',
      merchant,
      account_last4: '1234',
      account_type: 'savings',
      transaction_type: 'debit',
      category: 'Shopping',
      source: 'email_alert',
      metadata: {},
    });

    expect(result.merchant).toBe('H&M');
  });
});

describe('Account edge cases', () => {
  test('account last4 = "0000" is valid and not rejected', async () => {
    mockQueryResponse({ rows: [{ id: 'acct-0000', account_number_last4: '0000' }] });
    const result = await Account.upsert({
      userId: '00000000-0000-0000-0000-000000000001',
      institutionName: 'Test Bank',
      accountType: 'savings',
      instrumentType: 'savings_account',
      accountLast4: '0000',
      balance: 1000,
    });

    expect(result.account_number_last4).toBe('0000');
  });

  test('hidden account excluded from net worth but included when includeHidden=true', async () => {
    // getNetWorth query
    mockQueryResponse({ rows: [{ bank_balance: '40000', cc_outstanding: '0', cc_limit: '0' }] });
    const netWorth = await Account.getNetWorth('00000000-0000-0000-0000-000000000001');

    // Verify query includes hidden filter
    const nwQuery = mockQuery.mock.calls[0][0];
    expect(nwQuery).toContain('hidden = false');
    expect(parseFloat(netWorth.bank_balance)).toBe(40000);

    // getByUser with includeHidden=true
    mockQuery.mockReset();
    mockQueryResponse({ rows: [
      { id: '1', hidden: false },
      { id: '2', hidden: true },
    ] });
    const allAccounts = await Account.getByUser('00000000-0000-0000-0000-000000000001', { includeHidden: true });

    // Verify query does NOT filter hidden
    const listQuery = mockQuery.mock.calls[0][0];
    expect(listQuery).not.toContain('hidden = false');
    expect(allAccounts).toHaveLength(2);
  });
});

describe('Transaction date edge cases', () => {
  test('future date (pre-authorized) accepted and stored', async () => {
    const futureDate = '2026-04-15';
    mockQueryResponse({ rows: [{ id: 'future-txn', date: futureDate }] });
    const result = await Transaction.insertRaw({
      user_id: '00000000-0000-0000-0000-000000000001',
      email_id: 'test-future',
      amount: -1000,
      date: futureDate,
      merchant: 'Pre-auth Merchant',
      account_last4: '1234',
      account_type: 'savings',
      transaction_type: 'debit',
      category: 'Uncategorized',
      source: 'email_alert',
      metadata: {},
    });

    expect(result.date).toBe(futureDate);
  });

  test('old date (>1 year) accepted without cutoff', async () => {
    const oldDate = '2024-01-15';
    mockQueryResponse({ rows: [{ id: 'old-txn', date: oldDate }] });
    const result = await Transaction.insertRaw({
      user_id: '00000000-0000-0000-0000-000000000001',
      email_id: 'test-old',
      amount: -500,
      date: oldDate,
      merchant: 'Old Transaction',
      account_last4: '1234',
      account_type: 'savings',
      transaction_type: 'debit',
      category: 'Uncategorized',
      source: 'email_alert',
      metadata: {},
    });

    expect(result.date).toBe(oldDate);
  });
});

describe('User override behavior', () => {
  test('updateUserOverrides returns null when no fields provided', async () => {
    const result = await Transaction.updateUserOverrides(
      'some-id', 'some-user-id',
      {} // empty update
    );

    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('multiple overrides set in single call', async () => {
    const updated = {
      id: 'txn-1',
      user_merchant_override: 'New Merchant',
      user_category_override: 'Shopping',
      user_notes: 'Test note',
    };
    mockQueryRows([updated]);

    const result = await Transaction.updateUserOverrides(
      'txn-1', 'user-1',
      { merchant: 'New Merchant', category: 'Shopping', notes: 'Test note' }
    );

    expect(result.user_merchant_override).toBe('New Merchant');
    expect(result.user_category_override).toBe('Shopping');
    expect(result.user_notes).toBe('Test note');

    // Verify all three SET clauses in query
    const query = mockQuery.mock.calls[0][0];
    expect(query).toContain('user_merchant_override');
    expect(query).toContain('user_category_override');
    expect(query).toContain('user_notes');
  });
});

describe('Query building', () => {
  test('getByUser with all filters builds correct parameterized query', async () => {
    mockQueryResponse({ rows: [] });

    await Transaction.getByUser('user-1', {
      limit: 10,
      offset: 20,
      category: 'Food & Dining',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      search: 'Swiggy',
      accountLast4: '1234',
    });

    const [query, params] = mockQuery.mock.calls[0];
    expect(query).toContain('user_id = $1');
    expect(query).toContain('category = $2');
    expect(query).toContain('date >= $3');
    expect(query).toContain('date <= $4');
    expect(query).toContain('ILIKE $5');
    expect(query).toContain('account_last4 = $6');
    expect(query).toContain('LIMIT $7');
    expect(query).toContain('OFFSET $8');
    expect(params).toEqual(['user-1', 'Food & Dining', '2026-03-01', '2026-03-31', '%Swiggy%', '1234', 10, 20]);
  });

  test('getByUser with no filters returns all with default pagination', async () => {
    mockQueryResponse({ rows: [] });

    await Transaction.getByUser('user-1');

    const [query, params] = mockQuery.mock.calls[0];
    expect(query).not.toContain('category');
    expect(query).not.toContain('date >=');
    expect(query).not.toContain('ILIKE');
    expect(params).toEqual(['user-1', 50, 0]); // default limit=50, offset=0
  });
});
