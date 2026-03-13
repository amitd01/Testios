const { getPool, cleanTables, seedBasicData, closePool } = require('../helpers');

process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ANTHROPIC_API_KEY = '';

jest.resetModules();
const Requisition = require('../../src/models/Requisition');

let pool;
let testData;

beforeAll(() => { pool = getPool(); });
beforeEach(async () => {
  await cleanTables();
  testData = await seedBasicData();
});
afterAll(async () => { await closePool(); });

describe('Requisition', () => {
  test('findAll() returns requisitions with counts', async () => {
    const results = await Requisition.findAll();
    expect(results.length).toBe(1);
    expect(results[0].role_family_name).toBe('Sales');
    expect(parseInt(results[0].consultant_count)).toBe(1);
  });

  test('findAll() filters by status', async () => {
    const open = await Requisition.findAll({ status: 'open' });
    expect(open.length).toBe(1);

    const filled = await Requisition.findAll({ status: 'filled' });
    expect(filled.length).toBe(0);
  });

  test('findById() returns single requisition with role family name', async () => {
    const req = await Requisition.findById(testData.requisition.id);
    expect(req).not.toBeNull();
    expect(req.title).toBe('Test Sales Role');
    expect(req.role_family_name).toBe('Sales');
  });

  test('findById() returns null for nonexistent', async () => {
    const req = await Requisition.findById(99999);
    expect(req).toBeNull();
  });

  test('create() inserts and returns', async () => {
    const req = await Requisition.create({
      title: 'New Engineering Role',
      role_family_id: testData.salesFamilyId,
      hiring_manager_name: 'Manager',
      description: 'Build things',
    });
    expect(req.id).toBeDefined();
    expect(req.title).toBe('New Engineering Role');
    expect(req.status).toBe('open');
  });

  test('update() modifies allowed fields', async () => {
    const updated = await Requisition.update(testData.requisition.id, {
      title: 'Updated Title',
      description: 'Updated description',
    });
    expect(updated.title).toBe('Updated Title');
    expect(updated.description).toBe('Updated description');
  });

  test('update() sets filled_at when status is filled', async () => {
    const updated = await Requisition.update(testData.requisition.id, { status: 'filled' });
    expect(updated.status).toBe('filled');
    expect(updated.filled_at).not.toBeNull();
  });

  test('getAssignedConsultants() returns ranked consultants', async () => {
    const consultants = await Requisition.getAssignedConsultants(testData.requisition.id);
    expect(consultants.length).toBe(1);
    expect(consultants[0].firm_name).toBe('Test Firm');
    expect(consultants[0].computed_rank).toBe(1);
  });

  test('assignConsultant() creates and updates assignment', async () => {
    // Create another consultant
    const { rows: [c2] } = await pool.query(
      "INSERT INTO consultants (firm_name, active) VALUES ('Second Firm', true) RETURNING *"
    );
    const assignment = await Requisition.assignConsultant(testData.requisition.id, c2.id, 2);
    expect(assignment.consultant_id).toBe(c2.id);
    expect(assignment.computed_rank).toBe(2);

    // Update rank via upsert
    const updated = await Requisition.assignConsultant(testData.requisition.id, c2.id, 1);
    expect(updated.computed_rank).toBe(1);
  });
});
