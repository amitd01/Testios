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

describe('Pipeline Workflow E2E', () => {
  test('full pipeline: submit → screen → shortlist → briefing → sent_to_manager → interview_scheduled', async () => {
    // Submit CV
    const sub = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Full Pipeline Test',
        candidate_email: 'pipeline@test.com',
        consultant_id: testData.consultant.id,
        consultant_rationale: 'Experienced sales leader with 10 years in enterprise SaaS, manages large territories',
      });
    expect(sub.status).toBe(201);
    const subId = sub.body.id;

    // Verify auto-scoring happened
    const scoreRes = await request(app)
      .get(`/api/cv-submissions/${subId}/score`)
      .set('Authorization', `Bearer ${token}`);
    expect(scoreRes.status).toBe(200);
    expect(scoreRes.body.fit_score).toBeGreaterThan(0);

    // Advance: submitted → screened
    const screened = await request(app)
      .patch(`/api/cv-submissions/${subId}/advance`)
      .set('Authorization', `Bearer ${token}`);
    expect(screened.body.status).toBe('screened');

    // Advance: screened → shortlisted
    const shortlisted = await request(app)
      .patch(`/api/cv-submissions/${subId}/advance`)
      .set('Authorization', `Bearer ${token}`);
    expect(shortlisted.body.status).toBe('shortlisted');

    // Advance: shortlisted → sent_to_manager
    const sentToMgr = await request(app)
      .patch(`/api/cv-submissions/${subId}/advance`)
      .set('Authorization', `Bearer ${token}`);
    expect(sentToMgr.body.status).toBe('sent_to_manager');

    // Attempt to advance without briefing → should fail
    const blocked = await request(app)
      .patch(`/api/cv-submissions/${subId}/advance`)
      .set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/briefing/i);

    // Get candidate ID from submission
    const subDetail = await request(app)
      .get(`/api/cv-submissions/${subId}`)
      .set('Authorization', `Bearer ${token}`);
    const candidateId = subDetail.body.candidate_id;

    // Create a briefing via API
    const briefingRes = await request(app)
      .post('/api/briefings')
      .set('Authorization', `Bearer ${token}`)
      .send({ cv_submission_id: subId });
    expect(briefingRes.status).toBe(201);

    // Complete briefing directly in DB (chat/evaluate require ANTHROPIC_API_KEY)
    await pool.query(
      "UPDATE briefings SET status = 'completed', summary = 'Candidate is well prepared', completed_at = NOW() WHERE id = $1",
      [briefingRes.body.id]
    );

    // Now advance should work: sent_to_manager → interview_scheduled
    const interview = await request(app)
      .patch(`/api/cv-submissions/${subId}/advance`)
      .set('Authorization', `Bearer ${token}`);
    expect(interview.body.status).toBe('interview_scheduled');
  });

  test('rejection at any stage works correctly', async () => {
    const sub = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Rejection Test',
        consultant_id: testData.consultant.id,
      });

    // Advance to screened
    await request(app)
      .patch(`/api/cv-submissions/${sub.body.id}/advance`)
      .set('Authorization', `Bearer ${token}`);

    // Reject from screened
    const rejected = await request(app)
      .patch(`/api/cv-submissions/${sub.body.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Skills mismatch' });
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.rejection_reason).toBe('Skills mismatch');

    // Cannot reject again
    const rejectAgain = await request(app)
      .patch(`/api/cv-submissions/${sub.body.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Again' });
    expect(rejectAgain.status).toBe(400);
  });

  test('rescore endpoint re-evaluates a submission', async () => {
    const sub = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Rescore Test',
        consultant_id: testData.consultant.id,
        consultant_rationale: 'Junior candidate with limited experience',
      });

    const rescoreRes = await request(app)
      .post(`/api/cv-submissions/${sub.body.id}/rescore`)
      .set('Authorization', `Bearer ${token}`);
    expect(rescoreRes.status).toBe(200);
    expect(rescoreRes.body.fit_score).toBeDefined();
    expect(rescoreRes.body.fit_analysis).toBeDefined();
  });

  test('CV submission without required fields returns 400', async () => {
    const res = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ consultant_rationale: 'No requisition or name' });
    expect(res.status).toBe(400);
  });

  test('dashboard shows correct counts after multiple submissions', async () => {
    // Create 2 submissions
    await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Candidate A',
        consultant_id: testData.consultant.id,
      });
    const sub2 = await request(app)
      .post('/api/cv-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requisition_id: testData.requisition.id,
        candidate_name: 'Candidate B',
        consultant_id: testData.consultant.id,
      });

    // Advance one
    await request(app)
      .patch(`/api/cv-submissions/${sub2.body.id}/advance`)
      .set('Authorization', `Bearer ${token}`);

    const dashboard = await request(app)
      .get('/api/cv-submissions/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dashboard.status).toBe(200);

    const submitted = dashboard.body.find(s => s.status === 'submitted');
    const screened = dashboard.body.find(s => s.status === 'screened');
    expect(parseInt(submitted?.count || 0)).toBe(1);
    expect(parseInt(screened?.count || 0)).toBe(1);
  });
});
