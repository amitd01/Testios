/**
 * Test setup: provides mock database helpers and test utilities.
 * For API tests, we mock the database layer rather than requiring a live PostgreSQL instance.
 */

// Mock the database module
const mockQuery = jest.fn();
const mockGetClient = jest.fn();
const mockPool = { end: jest.fn() };

jest.mock('../src/config/database', () => ({
  query: mockQuery,
  getClient: mockGetClient,
  pool: mockPool,
}));

// Helper to reset mocks between tests
function resetDbMocks() {
  mockQuery.mockReset();
  mockGetClient.mockReset();
}

// Helper to set up mock query responses
function mockQueryResponse(response) {
  mockQuery.mockResolvedValueOnce(response);
}

function mockQueryRows(rows) {
  mockQuery.mockResolvedValueOnce({ rows, rowCount: rows.length });
}

// Create a test user for auth-related tests
const TEST_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@example.com',
  name: 'Test User',
  gmail_refresh_token: 'test-refresh-token',
  gmail_access_token: 'test-access-token',
  gmail_last_sync: '2026-03-10T00:00:00Z',
  onboarded: true,
};

// Create a test JWT token
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const TEST_TOKEN = jwt.sign({ userId: TEST_USER.id }, config.jwtSecret, { expiresIn: '1h' });
const EXPIRED_TOKEN = jwt.sign({ userId: TEST_USER.id }, config.jwtSecret, { expiresIn: '0s' });

// Sample test data
const TEST_TRANSACTION = {
  id: '00000000-0000-0000-0000-000000000010',
  user_id: TEST_USER.id,
  amount: -520.00,
  date: '2026-03-10',
  merchant: 'Swiggy',
  merchant_detail: 'Swiggy Order #1234',
  category: 'Food & Dining',
  account_last4: '1234',
  account_type: 'savings',
  transaction_type: 'debit',
  sources: ['email_alert'],
  verified: false,
  trust_score: 80,
  raw_transaction_ids: ['00000000-0000-0000-0000-000000000020'],
  metadata: {},
  instrument_type: 'savings_account',
  financial_type: 'debit',
  user_notes: null,
  user_merchant_override: null,
  user_category_override: null,
};

const TEST_ACCOUNT = {
  id: '00000000-0000-0000-0000-000000000030',
  user_id: TEST_USER.id,
  institution_name: 'HDFC Bank',
  account_type: 'savings',
  instrument_type: 'savings_account',
  account_number_last4: '1234',
  balance: 50000,
  credit_limit: null,
  hidden: false,
};

const TEST_BILL = {
  id: '00000000-0000-0000-0000-000000000040',
  user_id: TEST_USER.id,
  biller_name: 'Airtel',
  bill_type: 'mobile',
  amount: 599,
  due_date: '2026-03-20',
  paid: false,
};

module.exports = {
  mockQuery,
  mockGetClient,
  mockPool,
  resetDbMocks,
  mockQueryResponse,
  mockQueryRows,
  TEST_USER,
  TEST_TOKEN,
  EXPIRED_TOKEN,
  TEST_TRANSACTION,
  TEST_ACCOUNT,
  TEST_BILL,
};
