/**
 * Transactions API Tests (8 tests)
 */
const request = require('supertest');
const { mockQuery, resetDbMocks, mockQueryRows, mockQueryResponse, TEST_USER, TEST_TOKEN, TEST_TRANSACTION } = require('../setup');
const app = require('../../src/index');

beforeEach(() => {
  resetDbMocks();
});

describe('GET /api/transactions', () => {
  test('returns paginated list with total count', async () => {
    // Auth
    mockQueryRows([TEST_USER]);
    // Transaction.getByUser
    mockQueryResponse({ rows: [TEST_TRANSACTION], rowCount: 1 });
    // Transaction.getCount
    mockQueryResponse({ rows: [{ count: '25' }] });

    const res = await request(app)
      .get('/api/transactions?limit=10&offset=0')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.total).toBe(25);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(0);
    expect(res.body.transactions[0].id).toBe(TEST_TRANSACTION.id);
  });

  test('filters by category', async () => {
    mockQueryRows([TEST_USER]);
    mockQueryResponse({ rows: [TEST_TRANSACTION], rowCount: 1 });
    mockQueryResponse({ rows: [{ count: '1' }] });

    const res = await request(app)
      .get('/api/transactions?category=Food%20%26%20Dining')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    // Verify the query included category filter
    const queryCall = mockQuery.mock.calls[1]; // second call is getByUser
    expect(queryCall[0]).toContain('category');
    expect(queryCall[1]).toContain('Food & Dining');
  });

  test('filters by date range', async () => {
    mockQueryRows([TEST_USER]);
    mockQueryResponse({ rows: [], rowCount: 0 });
    mockQueryResponse({ rows: [{ count: '0' }] });

    const res = await request(app)
      .get('/api/transactions?startDate=2026-03-01&endDate=2026-03-31')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const queryCall = mockQuery.mock.calls[1];
    expect(queryCall[0]).toContain('date >=');
    expect(queryCall[0]).toContain('date <=');
    expect(queryCall[1]).toContain('2026-03-01');
    expect(queryCall[1]).toContain('2026-03-31');
  });

  test('searches by merchant name with ILIKE', async () => {
    mockQueryRows([TEST_USER]);
    mockQueryResponse({ rows: [TEST_TRANSACTION], rowCount: 1 });
    mockQueryResponse({ rows: [{ count: '1' }] });

    const res = await request(app)
      .get('/api/transactions?search=Swiggy')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const queryCall = mockQuery.mock.calls[1];
    expect(queryCall[0]).toContain('ILIKE');
    expect(queryCall[1]).toContain('%Swiggy%');
  });
});

describe('GET /api/transactions/:id', () => {
  test('returns single transaction with all fields', async () => {
    mockQueryRows([TEST_USER]);
    mockQueryRows([TEST_TRANSACTION]);

    const res = await request(app)
      .get(`/api/transactions/${TEST_TRANSACTION.id}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const txn = res.body.transaction;
    expect(txn.id).toBe(TEST_TRANSACTION.id);
    expect(txn.amount).toBe(TEST_TRANSACTION.amount);
    expect(txn.merchant).toBe(TEST_TRANSACTION.merchant);
    expect(txn.category).toBe(TEST_TRANSACTION.category);
    expect(txn.accountLast4).toBe(TEST_TRANSACTION.account_last4);
    expect(txn.type).toBe(TEST_TRANSACTION.transaction_type);
    expect(txn.sources).toEqual(TEST_TRANSACTION.sources);
    expect(txn.verified).toBe(TEST_TRANSACTION.verified);
    expect(txn.trustScore).toBe(TEST_TRANSACTION.trust_score);
    expect(txn.instrumentType).toBe(TEST_TRANSACTION.instrument_type);
    expect(txn.financialType).toBe(TEST_TRANSACTION.financial_type);
  });
});

describe('PATCH /api/transactions/:id', () => {
  test('updates merchant name via user_merchant_override', async () => {
    const updatedTxn = { ...TEST_TRANSACTION, user_merchant_override: 'Swiggy Instamart' };
    mockQueryRows([TEST_USER]);
    mockQueryRows([updatedTxn]);

    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION.id}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ merchant: 'Swiggy Instamart' });

    expect(res.status).toBe(200);
    expect(res.body.transaction.merchant).toBe('Swiggy Instamart');
    expect(res.body.transaction.merchantOriginal).toBe(TEST_TRANSACTION.merchant);
  });

  test('updates category via user_category_override', async () => {
    const updatedTxn = { ...TEST_TRANSACTION, user_category_override: 'Shopping' };
    mockQueryRows([TEST_USER]);
    mockQueryRows([updatedTxn]);

    const res = await request(app)
      .patch(`/api/transactions/${TEST_TRANSACTION.id}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ category: 'Shopping' });

    expect(res.status).toBe(200);
    expect(res.body.transaction.category).toBe('Shopping');
    expect(res.body.transaction.categoryOriginal).toBe(TEST_TRANSACTION.category);
  });
});

describe('GET /api/transactions/export', () => {
  test('returns valid CSV with headers', async () => {
    mockQueryRows([TEST_USER]);
    mockQueryResponse({ rows: [TEST_TRANSACTION], rowCount: 1 });

    const res = await request(app)
      .get('/api/transactions/export')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('transactions.csv');

    const lines = res.text.split('\n');
    expect(lines[0]).toBe('Date,Merchant,Category,Amount,Account,Type,Source');
    expect(lines.length).toBeGreaterThan(1);
    // Verify data row
    expect(lines[1]).toContain(TEST_TRANSACTION.merchant);
    expect(lines[1]).toContain(String(TEST_TRANSACTION.amount));
  });
});
