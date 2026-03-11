/**
 * Sync API Tests (7 tests)
 *
 * These tests mock the EmailProcessingEngine since sync involves Gmail API calls.
 * We verify the controller layer correctly calls the engine and returns results.
 */
const request = require('supertest');
const { mockQuery, resetDbMocks, mockQueryRows, mockQueryResponse, TEST_USER, TEST_TOKEN } = require('../setup');

// Mock the EmailProcessingEngine
const mockRunFullSync = jest.fn();
const mockRunOnboardingScan = jest.fn();
const mockRunReparse = jest.fn();

jest.mock('../../src/services/emailProcessingEngine', () => {
  return jest.fn().mockImplementation(() => ({
    runFullSync: mockRunFullSync,
    runOnboardingScan: mockRunOnboardingScan,
    runReparse: mockRunReparse,
  }));
});

const app = require('../../src/index');

beforeEach(() => {
  resetDbMocks();
  mockRunFullSync.mockReset();
  mockRunOnboardingScan.mockReset();
  mockRunReparse.mockReset();
});

describe('POST /api/sync/onboarding', () => {
  test('returns correct stats including harmonized count', async () => {
    mockQueryRows([TEST_USER]); // auth
    mockRunOnboardingScan.mockResolvedValueOnce({
      fetched: 50,
      parsed: 40,
      failed: 5,
      skipped: 5,
      transactions: 35,
      harmonized: 30,
      dedupStats: { input: 35, output: 30, duplicates: 5 },
    });
    // User.setOnboarded
    mockQueryResponse({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/sync/onboarding')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ days: 30 });

    expect(res.status).toBe(200);
    expect(res.body.stats.fetched).toBe(50);
    expect(res.body.stats.parsed).toBe(40);
    expect(res.body.stats.harmonized).toBe(30);
  });

  test('triggers re-parse when all emails already stored', async () => {
    mockQueryRows([TEST_USER]); // auth
    // First call: onboardingScan returns all skipped
    mockRunOnboardingScan.mockResolvedValueOnce({
      fetched: 0,
      parsed: 0,
      failed: 0,
      skipped: 50,
      transactions: 0,
    });
    // Re-parse engine mock
    mockRunReparse.mockResolvedValueOnce({
      parsed: 45,
      failed: 5,
      transactions: 40,
      harmonized: 35,
    });
    // User.setOnboarded
    mockQueryResponse({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/sync/onboarding')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ days: 30 });

    expect(res.status).toBe(200);
    expect(res.body.reparsed).toBe(true);
    expect(res.body.stats.harmonized).toBe(35);
  });
});

describe('POST /api/sync/start', () => {
  test('runs incremental sync from last_sync date', async () => {
    mockQueryRows([TEST_USER]); // auth
    // syncController.startSync calls User.findById again
    mockQueryRows([TEST_USER]);
    mockRunFullSync.mockResolvedValueOnce({
      fetched: 10,
      parsed: 8,
      failed: 2,
      transactions: 7,
      harmonized: 6,
    });

    const res = await request(app)
      .post('/api/sync/start')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.fetched).toBe(10);
    // Verify sinceDate was passed from user's gmail_last_sync
    expect(mockRunFullSync).toHaveBeenCalledWith(
      expect.objectContaining({
        sinceDate: expect.any(Date),
      })
    );
  });
});

describe('POST /api/sync/reparse', () => {
  test('clears transactions and re-processes stored emails', async () => {
    mockQueryRows([TEST_USER]); // auth
    mockRunReparse.mockResolvedValueOnce({
      parsed: 40,
      failed: 5,
      transactions: 35,
      harmonized: 30,
      dedupStats: { input: 35, output: 30, duplicates: 5 },
    });

    const res = await request(app)
      .post('/api/sync/reparse')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.parsed).toBe(40);
    expect(res.body.stats.harmonized).toBe(30);
    expect(mockRunReparse).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/sync/status', () => {
  test('returns sync status with lastSync and gmailConnected', async () => {
    mockQueryRows([TEST_USER]); // auth
    // syncController.getStatus calls User.findById
    mockQueryRows([TEST_USER]);

    const res = await request(app)
      .get('/api/sync/status')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.lastSync).toBe(TEST_USER.gmail_last_sync);
    expect(res.body.gmailConnected).toBe(true);
    expect(res.body.onboarded).toBe(true);
  });

  test('returns gmailConnected=false when no refresh token', async () => {
    const userNoGmail = { ...TEST_USER, gmail_refresh_token: null };
    mockQueryRows([userNoGmail]); // auth
    mockQueryRows([userNoGmail]); // getStatus findById

    const res = await request(app)
      .get('/api/sync/status')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.gmailConnected).toBe(false);
  });
});
