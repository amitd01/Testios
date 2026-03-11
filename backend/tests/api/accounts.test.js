/**
 * Accounts & Bills API Tests (5 tests)
 */
const request = require('supertest');
const { mockQuery, resetDbMocks, mockQueryRows, mockQueryResponse, TEST_USER, TEST_TOKEN, TEST_ACCOUNT, TEST_BILL } = require('../setup');
const app = require('../../src/index');

beforeEach(() => {
  resetDbMocks();
});

describe('GET /api/accounts', () => {
  test('returns non-hidden accounts formatted correctly', async () => {
    mockQueryRows([TEST_USER]); // auth
    mockQueryRows([TEST_ACCOUNT]);

    const res = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(1);
    const acct = res.body.accounts[0];
    expect(acct.id).toBe(TEST_ACCOUNT.id);
    expect(acct.institution).toBe(TEST_ACCOUNT.institution_name);
    expect(acct.type).toBe(TEST_ACCOUNT.account_type);
    expect(acct.last4).toBe(TEST_ACCOUNT.account_number_last4);
    expect(acct.balance).toBe(TEST_ACCOUNT.balance);
    expect(acct.hidden).toBe(false);

    // Verify query filtered hidden accounts
    const queryCall = mockQuery.mock.calls[1]; // second call is getByUser
    expect(queryCall[0]).toContain('hidden = false');
  });

  test('includes hidden accounts when includeHidden=true', async () => {
    const hiddenAccount = { ...TEST_ACCOUNT, id: '00000000-0000-0000-0000-000000000031', hidden: true };
    mockQueryRows([TEST_USER]); // auth
    mockQueryRows([TEST_ACCOUNT, hiddenAccount]);

    const res = await request(app)
      .get('/api/accounts?includeHidden=true')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(2);

    // Verify query did NOT filter hidden
    const queryCall = mockQuery.mock.calls[1];
    expect(queryCall[0]).not.toContain('hidden = false');
  });
});

describe('PATCH /api/accounts/:id', () => {
  test('toggles hidden flag', async () => {
    const updatedAccount = { ...TEST_ACCOUNT, hidden: true };
    mockQueryRows([TEST_USER]); // auth
    mockQueryRows([updatedAccount]); // Account.updateHidden

    const res = await request(app)
      .patch(`/api/accounts/${TEST_ACCOUNT.id}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ hidden: true });

    expect(res.status).toBe(200);
    expect(res.body.account.hidden).toBe(true);
  });
});

describe('GET /api/bills', () => {
  test('returns bills sorted by due date', async () => {
    const bill2 = { ...TEST_BILL, id: '00000000-0000-0000-0000-000000000041', biller_name: 'BESCOM', due_date: '2026-03-25' };
    mockQueryRows([TEST_USER]); // auth
    mockQueryRows([TEST_BILL, bill2]);

    const res = await request(app)
      .get('/api/bills')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.bills).toHaveLength(2);
    expect(res.body.bills[0].biller).toBe('Airtel');
    expect(res.body.bills[0].amount).toBe(599);
    expect(res.body.bills[0].paid).toBe(false);
    expect(res.body.bills[1].biller).toBe('BESCOM');
  });
});

describe('PATCH /api/bills/:id/pay', () => {
  test('marks bill as paid', async () => {
    const paidBill = { ...TEST_BILL, paid: true, paid_at: '2026-03-11T10:00:00Z' };
    mockQueryRows([TEST_USER]); // auth
    mockQueryRows([paidBill]); // Bill.markPaid

    const res = await request(app)
      .patch(`/api/bills/${TEST_BILL.id}/pay`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.bill.paid).toBe(true);
    expect(res.body.bill.paid_at).toBeDefined();
  });
});
