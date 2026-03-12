/**
 * Dashboard API Tests (5 tests)
 */
const request = require('supertest');
const { mockQuery, resetDbMocks, mockQueryRows, mockQueryResponse, TEST_USER, TEST_TOKEN, TEST_TRANSACTION, TEST_ACCOUNT, TEST_BILL } = require('../setup');
const app = require('../../src/index');

beforeEach(() => {
  resetDbMocks();
});

// Helper: set up all mock responses the dashboard controller needs
// Auth (1) + 8 model queries, but RawEmail.getStats makes 3 internal queries = 12 total
function setupDashboardMocks({ netWorth, cashFlow, lastMonthCashFlow, spending, goals, investments, upcomingBills, emailStats, recentTxns } = {}) {
  // 1. Auth middleware: User.findById
  mockQueryRows([TEST_USER]);

  // 2. Account.getNetWorth
  mockQueryResponse({ rows: [netWorth || { bank_balance: '50000', cc_outstanding: '-5000', cc_limit: '100000' }] });
  // 3. Transaction.getCashFlow (current month)
  mockQueryResponse({ rows: [cashFlow || { income: '80000', spending: '45000' }] });
  // 4. Transaction.getCashFlow (last month)
  mockQueryResponse({ rows: [lastMonthCashFlow || { income: '75000', spending: '40000' }] });
  // 5. Transaction.getMonthlySpending
  mockQueryResponse({ rows: spending || [{ category: 'Food & Dining', total: '12000' }, { category: 'Transportation', total: '5000' }] });
  // 6. Goal.getByUser
  mockQueryResponse({ rows: goals || [] });
  // 7. Investment.getPortfolioSummary
  mockQueryResponse({ rows: investments || [] });
  // 8. Bill.getByUser
  mockQueryResponse({ rows: upcomingBills || [] });
  // 9. RawEmail.getStats — makes 3 parallel queries (statusResult, categoryResult, rawTxnResult)
  mockQueryResponse({ rows: [emailStats || { total: '100', success: '85', failed: '10', pending: '5' }] });
  mockQueryResponse({ rows: [] }); // categoryResult (email_category counts)
  mockQueryResponse({ rows: [{ count: '0' }] }); // rawTxnResult (raw_transactions count)
  // 10. Transaction.getByUser (recent)
  mockQueryResponse({ rows: recentTxns || [TEST_TRANSACTION] });
}

describe('GET /api/dashboard', () => {
  test('returns all required fields', async () => {
    setupDashboardMocks();

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('netWorth');
    expect(res.body).toHaveProperty('cashFlow');
    expect(res.body).toHaveProperty('spendingBreakdown');
    expect(res.body).toHaveProperty('goals');
    expect(res.body).toHaveProperty('investments');
    expect(res.body).toHaveProperty('upcomingBills');
    expect(res.body).toHaveProperty('emailSync');
    expect(res.body).toHaveProperty('recentTransactions');
    expect(res.body).toHaveProperty('nudges');
  });

  test('returns zeros when no data exists', async () => {
    setupDashboardMocks({
      netWorth: { bank_balance: null, cc_outstanding: null, cc_limit: null },
      cashFlow: { income: null, spending: null },
      lastMonthCashFlow: { income: null, spending: null },
      spending: [],
      goals: [],
      investments: [],
      upcomingBills: [],
      emailStats: { total: '0', success: '0', failed: '0', pending: '0' },
      recentTxns: [],
    });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.netWorth.total).toBe(0);
    expect(res.body.cashFlow.income).toBe(0);
    expect(res.body.cashFlow.spending).toBe(0);
    expect(res.body.cashFlow.savings).toBe(0);
    expect(res.body.spendingBreakdown.categories).toHaveLength(0);
    expect(res.body.recentTransactions).toHaveLength(0);
  });

  test('calculates cash flow correctly', async () => {
    setupDashboardMocks({
      cashFlow: { income: '100000', spending: '60000' },
      lastMonthCashFlow: { income: '90000', spending: '55000' },
    });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.body.cashFlow.income).toBe(100000);
    expect(res.body.cashFlow.spending).toBe(60000);
    expect(res.body.cashFlow.savings).toBe(40000);
    expect(res.body.cashFlow.lastMonthIncome).toBe(90000);
    expect(res.body.cashFlow.lastMonthSpending).toBe(55000);
  });

  test('net worth excludes credit card outstanding', async () => {
    setupDashboardMocks({
      netWorth: { bank_balance: '100000', cc_outstanding: '-15000', cc_limit: '200000' },
      investments: [],
    });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    // net worth = bank (100000) + investments (0) - cc_outstanding (15000)
    expect(res.body.netWorth.total).toBe(85000);
    expect(res.body.netWorth.bankBalance).toBe(100000);
    expect(res.body.netWorth.liabilities).toBe(15000);
  });

  test('generates spending nudge when near last month total', async () => {
    setupDashboardMocks({
      cashFlow: { income: '100000', spending: '50000' },
      lastMonthCashFlow: { income: '100000', spending: '55000' },
    });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    // spending (50000) > lastMonthSpending (55000) * 0.8 = 44000 → nudge
    const spendingNudge = res.body.nudges.find(n => n.title === 'Spending Alert');
    expect(spendingNudge).toBeDefined();
    expect(spendingNudge.type).toBe('warning');
  });
});
