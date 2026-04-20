process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ANTHROPIC_API_KEY = '';
process.env.PORT = '0'; // random port

jest.resetModules();

const request = require('supertest');
const { getPool, cleanTables, seedBasicData, getAuthToken, closePool } = require('../helpers');

// Build express app for testing
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

describe('API Integration', () => {
  test('GET /api/role-families requires auth', async () => {
    const res = await request(app).get('/api/role-families');
    expect(res.status).toBe(401);
  });

  test('GET /api/role-families returns families', async () => {
    const res = await request(app)
      .get('/api/role-families')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(8);
  });

  test('GET /api/consultants returns list', async () => {
    const res = await request(app)
      .get('/api/consultants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/requisitions returns list', async () => {
    const res = await request(app)
      .get('/api/requisitions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  test('POST /api/cv-submissions creates and auto-scores', async () => {
    const res = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'API Test Candidate',
        candidate_email: 'api@test.com',
        consultant_id: testData.consultant.id,
        consultant_rationale: 'Strong sales background with 5 years experience selling SaaS solutions',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('submitted');
  });

  test('GET /api/cv-submissions/:id/score returns score', async () => {
    // Create a submission first
    const createRes = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Score Test',
        consultant_id: testData.consultant.id,
        consultant_rationale: 'Great sales candidate with territory management experience',
      });

    const scoreRes = await request(app)
      .get(`/api/cv-submissions/${createRes.body.id}/score`)
      .set('Authorization', `Bearer ${token}`);
    expect(scoreRes.status).toBe(200);
    expect(scoreRes.body.fit_score).toBeDefined();
  });

  test('PATCH /api/cv-submissions/:id/advance works', async () => {
    const createRes = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Advance Test',
        consultant_id: testData.consultant.id,
      });

    const advanceRes = await request(app)
      .patch(`/api/cv-submissions/${createRes.body.id}/advance`)
      .set('Authorization', `Bearer ${token}`);
    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.status).toBe('screened');
  });

  test('PATCH /api/cv-submissions/:id/reject works', async () => {
    const createRes = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Reject Test',
        consultant_id: testData.consultant.id,
      });

    const rejectRes = await request(app)
      .patch(`/api/cv-submissions/${createRes.body.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Not a fit' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('rejected');
  });

  test('GET /api/cv-submissions/dashboard returns stats', async () => {
    await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Dashboard Test',
        consultant_id: testData.consultant.id,
      });

    const res = await request(app)
      .get('/api/cv-submissions/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('POST /api/interview-slots creates a slot', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(11, 0, 0, 0);

    const res = await request(app)
      .post('/api/interview-slots')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        interviewer_name: 'Test Interviewer',
        interviewer_email: 'interviewer@test.com',
        start_time: tomorrow.toISOString(),
        end_time: end.toISOString(),
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  test('GET /api/interview-slots returns slots', async () => {
    const res = await request(app)
      .get(`/api/interview-slots?requisition_id=${testData.requisition.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('full pipeline flow: submit → advance → reject', async () => {
    // Submit
    const sub = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Pipeline Flow Test',
        consultant_id: testData.consultant.id,
        consultant_rationale: 'Senior sales engineer with 8 years experience in manufacturing',
      });
    expect(sub.body.status).toBe('submitted');

    // Advance to screened
    const screened = await request(app)
      .patch(`/api/cv-submissions/${sub.body.id}/advance`)
      .set('Authorization', `Bearer ${token}`);
    expect(screened.body.status).toBe('screened');

    // Advance to shortlisted
    const shortlisted = await request(app)
      .patch(`/api/cv-submissions/${sub.body.id}/advance`)
      .set('Authorization', `Bearer ${token}`);
    expect(shortlisted.body.status).toBe('shortlisted');

    // Reject
    const rejected = await request(app)
      .patch(`/api/cv-submissions/${sub.body.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Better candidates available' });
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.rejection_reason).toBe('Better candidates available');
  });
});
