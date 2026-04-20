process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ANTHROPIC_API_KEY = '';
process.env.PORT = '0';

jest.resetModules();

const request = require('supertest');
const { getPool, cleanTables, seedBasicData, getAuthToken, closePool } = require('../helpers');

const express = require('express');
const cors = require('cors');
const routes = require('../../src/routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);

let pool;
let testData;
let token;

beforeAll(() => {
  pool = getPool();
  token = getAuthToken();
});
beforeEach(async () => {
  await cleanTables();
  testData = await seedBasicData();
});
afterAll(async () => { await closePool(); });

describe('Analytics API', () => {
  test('GET /api/analytics/time-to-hire returns data', async () => {
    const res = await request(app)
      .get('/api/analytics/time-to-hire')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/analytics/time-to-hire accepts months param', async () => {
    const res = await request(app)
      .get('/api/analytics/time-to-hire?months=6')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/analytics/consultant-comparison returns data', async () => {
    const res = await request(app)
      .get('/api/analytics/consultant-comparison')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/analytics/stage-dropoff returns data', async () => {
    const res = await request(app)
      .get('/api/analytics/stage-dropoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/analytics/briefing-effectiveness returns data', async () => {
    const res = await request(app)
      .get('/api/analytics/briefing-effectiveness')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/analytics/role-family-breakdown returns data', async () => {
    const res = await request(app)
      .get('/api/analytics/role-family-breakdown')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('analytics endpoints require auth', async () => {
    const endpoints = [
      '/api/analytics/time-to-hire',
      '/api/analytics/consultant-comparison',
      '/api/analytics/stage-dropoff',
      '/api/analytics/briefing-effectiveness',
      '/api/analytics/role-family-breakdown',
    ];
    for (const endpoint of endpoints) {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    }
  });

  test('GET /api/analytics/consultant-comparison with seeded outcomes', async () => {
    // Seed some hiring outcomes
    await pool.query(
      `INSERT INTO hiring_outcomes (requisition_id, consultant_id, role_family_id, candidate_id, submitted, interviewed, offered, accepted, time_to_fill_days)
       VALUES ($1, $2, $3, $4, true, true, true, true, 30),
              ($1, $2, $3, $4, true, true, false, false, null),
              ($1, $2, $3, $4, true, false, false, false, null)`,
      [testData.requisition.id, testData.consultant.id, testData.salesFamilyId, testData.candidate.id]
    );

    const res = await request(app)
      .get('/api/analytics/consultant-comparison')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].firm_name).toBeDefined();
  });
});
