const { getPool, cleanTables, seedBasicData, closePool } = require('../helpers');

// Override DATABASE_URL before requiring models
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ANTHROPIC_API_KEY = '';

// Clear cached modules so they use test DB
jest.resetModules();
const CvSubmission = require('../../src/models/CvSubmission');

let pool;
let testData;

beforeAll(() => { pool = getPool(); });
beforeEach(async () => {
  await cleanTables();
  testData = await seedBasicData();
});
afterAll(async () => { await closePool(); });

describe('CvSubmission', () => {
  test('create() inserts a new submission', async () => {
    const sub = await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
      consultant_rationale: 'Great candidate',
    });
    expect(sub.id).toBeDefined();
    expect(sub.status).toBe('submitted');
    expect(sub.consultant_rationale).toBe('Great candidate');
  });

  test('findAll() returns submissions with joins', async () => {
    await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    const results = await CvSubmission.findAll({ requisition_id: testData.requisition.id });
    expect(results.length).toBe(1);
    expect(results[0].candidate_name).toBe('Test Candidate');
    expect(results[0].consultant_firm).toBe('Test Firm');
  });

  test('findById() returns submission with all joins', async () => {
    const sub = await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    const found = await CvSubmission.findById(sub.id);
    expect(found).not.toBeNull();
    expect(found.candidate_name).toBe('Test Candidate');
  });

  test('advance() follows valid transitions', async () => {
    const sub = await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    const screened = await CvSubmission.advance(sub.id);
    expect(screened.status).toBe('screened');

    const shortlisted = await CvSubmission.advance(sub.id);
    expect(shortlisted.status).toBe('shortlisted');

    const sentToMgr = await CvSubmission.advance(sub.id);
    expect(sentToMgr.status).toBe('sent_to_manager');
  });

  test('advance() blocks interview_scheduled without briefing', async () => {
    const sub = await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    // Move to sent_to_manager
    await CvSubmission.advance(sub.id); // screened
    await CvSubmission.advance(sub.id); // shortlisted
    await CvSubmission.advance(sub.id); // sent_to_manager

    // Should block
    await expect(CvSubmission.advance(sub.id)).rejects.toThrow('briefing');
  });

  test('advance() allows interview_scheduled with completed briefing', async () => {
    const sub = await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    await CvSubmission.advance(sub.id); // screened
    await CvSubmission.advance(sub.id); // shortlisted
    await CvSubmission.advance(sub.id); // sent_to_manager

    // Create completed briefing
    await pool.query(
      `INSERT INTO briefings (cv_submission_id, candidate_id, requisition_id, status)
       VALUES ($1, $2, $3, 'completed')`,
      [sub.id, testData.candidate.id, testData.requisition.id]
    );

    const advanced = await CvSubmission.advance(sub.id);
    expect(advanced.status).toBe('interview_scheduled');
  });

  test('reject() sets rejection reason', async () => {
    const sub = await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    const rejected = await CvSubmission.reject(sub.id, 'Not qualified');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejection_reason).toBe('Not qualified');
  });

  test('reject() fails from terminal status', async () => {
    const sub = await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    await CvSubmission.reject(sub.id, 'Bad fit');
    await expect(CvSubmission.reject(sub.id, 'Again')).rejects.toThrow('Cannot reject');
  });

  test('getDashboard() returns aggregated stats', async () => {
    await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    const stats = await CvSubmission.getDashboard();
    expect(stats.length).toBeGreaterThan(0);
    expect(stats[0].status).toBe('submitted');
    expect(parseInt(stats[0].count)).toBe(1);
  });

  test('updateScore() sets fit_score and fit_analysis', async () => {
    const sub = await CvSubmission.create({
      requisition_id: testData.requisition.id,
      candidate_id: testData.candidate.id,
      consultant_id: testData.consultant.id,
    });
    const updated = await CvSubmission.updateScore(sub.id, {
      fit_score: 78,
      fit_analysis: { dimensions: { role_relevance: 16 }, summary: 'Good fit' },
    });
    expect(updated.fit_score).toBe(78);
    expect(updated.scored_at).toBeDefined();
  });
});
