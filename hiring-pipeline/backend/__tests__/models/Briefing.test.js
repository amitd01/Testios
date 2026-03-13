const { getPool, cleanTables, seedBasicData, closePool } = require('../helpers');

process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ANTHROPIC_API_KEY = '';

jest.resetModules();
const Briefing = require('../../src/models/Briefing');
const CvSubmission = require('../../src/models/CvSubmission');

let pool;
let testData;
let submission;

beforeAll(() => { pool = getPool(); });
beforeEach(async () => {
  await cleanTables();
  testData = await seedBasicData();
  submission = await CvSubmission.create({
    requisition_id: testData.requisition.id,
    candidate_id: testData.candidate.id,
    consultant_id: testData.consultant.id,
  });
});
afterAll(async () => { await closePool(); });

describe('Briefing', () => {
  test('create() inserts a new briefing with UUID token', async () => {
    const briefing = await Briefing.create({
      cv_submission_id: submission.id,
      candidate_id: testData.candidate.id,
      requisition_id: testData.requisition.id,
    });
    expect(briefing.id).toBeDefined();
    expect(briefing.link_token).toBeDefined();
    expect(briefing.status).toBe('pending');
    expect(briefing.transcript).toEqual([]);
  });

  test('findById() returns briefing with joined data', async () => {
    const created = await Briefing.create({
      cv_submission_id: submission.id,
      candidate_id: testData.candidate.id,
      requisition_id: testData.requisition.id,
    });
    const found = await Briefing.findById(created.id);
    expect(found).not.toBeNull();
    expect(found.candidate_name).toBe('Test Candidate');
    expect(found.requisition_title).toBe('Test Sales Role');
  });

  test('findByToken() works with UUID tokens', async () => {
    const created = await Briefing.create({
      cv_submission_id: submission.id,
      candidate_id: testData.candidate.id,
      requisition_id: testData.requisition.id,
    });
    const found = await Briefing.findByToken(created.link_token);
    expect(found).not.toBeNull();
    expect(found.id).toBe(created.id);
  });

  test('appendMessage() appends to transcript and updates status', async () => {
    const created = await Briefing.create({
      cv_submission_id: submission.id,
      candidate_id: testData.candidate.id,
      requisition_id: testData.requisition.id,
    });

    const updated = await Briefing.appendMessage(created.id, 'candidate', 'Hello, I am interested');
    expect(updated.status).toBe('in_progress');
    expect(updated.started_at).not.toBeNull();
    expect(updated.transcript.length).toBe(1);
    expect(updated.transcript[0].role).toBe('candidate');
    expect(updated.transcript[0].content).toBe('Hello, I am interested');

    // Append another message
    const updated2 = await Briefing.appendMessage(created.id, 'assistant', 'Welcome!');
    expect(updated2.transcript.length).toBe(2);
  });

  test('complete() sets status and summary for pass', async () => {
    const created = await Briefing.create({
      cv_submission_id: submission.id,
      candidate_id: testData.candidate.id,
      requisition_id: testData.requisition.id,
    });

    const completed = await Briefing.complete(created.id, {
      summary: 'Candidate demonstrated good understanding',
      passed: true,
    });
    expect(completed.status).toBe('completed');
    expect(completed.summary).toBe('Candidate demonstrated good understanding');
    expect(completed.completed_at).not.toBeNull();
  });

  test('complete() sets failed status for fail', async () => {
    const created = await Briefing.create({
      cv_submission_id: submission.id,
      candidate_id: testData.candidate.id,
      requisition_id: testData.requisition.id,
    });

    const failed = await Briefing.complete(created.id, {
      summary: 'Candidate had unrealistic expectations',
      passed: false,
    });
    expect(failed.status).toBe('failed');
  });
});
