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

describe('Requisition API', () => {
  test('GET /api/requisitions returns list', async () => {
    const res = await request(app)
      .get('/api/requisitions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('Test Sales Role');
  });

  test('POST /api/requisitions creates and returns 201', async () => {
    const res = await request(app)
      .post('/api/requisitions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'New Role',
        role_family_id: testData.salesFamilyId,
        hiring_manager_name: 'Test Manager',
        description: 'A new role',
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New Role');
    expect(res.body.id).toBeDefined();
  });

  test('POST /api/requisitions returns 400 without title', async () => {
    const res = await request(app)
      .post('/api/requisitions')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'No title' });
    expect(res.status).toBe(400);
  });

  test('GET /api/requisitions/:id returns single with consultants', async () => {
    const res = await request(app)
      .get(`/api/requisitions/${testData.requisition.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Test Sales Role');
    expect(res.body.assigned_consultants).toBeDefined();
    expect(res.body.assigned_consultants.length).toBe(1);
  });

  test('GET /api/requisitions/:id returns 404 for nonexistent', async () => {
    const res = await request(app)
      .get('/api/requisitions/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('PATCH /api/requisitions/:id updates fields', async () => {
    const res = await request(app)
      .patch(`/api/requisitions/${testData.requisition.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', description: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });

  test('GET /api/requisitions/:id/suggest-consultants returns suggestions', async () => {
    // Seed some hiring outcomes so yield calculator has data
    await pool.query(
      `INSERT INTO hiring_outcomes (requisition_id, consultant_id, role_family_id, candidate_id, submitted, interviewed, offered, accepted, time_to_fill_days)
       VALUES ($1, $2, $3, $4, true, true, true, true, 25),
              ($1, $2, $3, $4, true, true, false, false, null),
              ($1, $2, $3, $4, true, false, false, false, null)`,
      [testData.requisition.id, testData.consultant.id, testData.salesFamilyId, testData.candidate.id]
    );

    const res = await request(app)
      .get(`/api/requisitions/${testData.requisition.id}/suggest-consultants`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/requisitions/:id/assign-consultants assigns consultants', async () => {
    const { rows: [c2] } = await pool.query(
      "INSERT INTO consultants (firm_name, active) VALUES ('Another Firm', true) RETURNING *"
    );

    const res = await request(app)
      .post(`/api/requisitions/${testData.requisition.id}/assign-consultants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ consultant_ids: [c2.id] });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  test('POST /api/requisitions/:id/assign-consultants returns 400 without array', async () => {
    const res = await request(app)
      .post(`/api/requisitions/${testData.requisition.id}/assign-consultants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ consultant_ids: 'not-array' });
    expect(res.status).toBe(400);
  });
});
