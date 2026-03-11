/**
 * Auth API Tests (5 tests)
 */
const request = require('supertest');

// Mock database before requiring app
const { mockQuery, mockGetClient, resetDbMocks, mockQueryRows, TEST_USER, TEST_TOKEN, EXPIRED_TOKEN } = require('../setup');

const app = require('../../src/index');

beforeEach(() => {
  resetDbMocks();
});

describe('GET /api/me', () => {
  test('returns user profile when authenticated', async () => {
    // Auth middleware calls User.findById
    mockQueryRows([TEST_USER]);

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.name).toBe(TEST_USER.name);
    expect(res.body.user.onboarded).toBe(true);
    expect(res.body.user.gmailConnected).toBe(true);
    expect(res.body.user.lastSync).toBe(TEST_USER.gmail_last_sync);
  });

  test('returns 401 when no token provided', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing|invalid/i);
  });

  test('returns 401 with expired token', async () => {
    // Wait briefly to ensure token is expired (generated with expiresIn: '0s')
    await new Promise(r => setTimeout(r, 50));

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${EXPIRED_TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid|expired/i);
  });

  test('returns 401 when user not found in database', async () => {
    // Auth middleware calls User.findById — return empty
    mockQueryRows([]);

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('POST /api/revoke', () => {
  test('clears user data and returns success', async () => {
    // revokeAccess calls User.findById
    mockQueryRows([TEST_USER]);

    // User.deleteAllData calls getClient
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockGetClient.mockResolvedValueOnce(mockClient);

    const res = await request(app)
      .post('/api/revoke')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted|revoked|cleared/i);
    // Verify deleteAllData was called (BEGIN + deletes + COMMIT)
    expect(mockClient.query).toHaveBeenCalled();
    expect(mockClient.release).toHaveBeenCalled();
  });
});
