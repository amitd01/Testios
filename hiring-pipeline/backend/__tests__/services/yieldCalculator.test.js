process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ANTHROPIC_API_KEY = '';

jest.resetModules();
const { getPool, cleanTables, closePool } = require('../helpers');
const YieldCalculator = require('../../src/services/yieldCalculator');

let pool;

beforeAll(() => { pool = getPool(); });
beforeEach(async () => { await cleanTables(); });
afterAll(async () => { await closePool(); });

describe('YieldCalculator', () => {
  async function seedOutcomes(consultantId, roleFamilyId, count, interviewRate, offerRate, acceptRate) {
    for (let i = 0; i < count; i++) {
      const interviewed = Math.random() < interviewRate;
      const offered = interviewed && Math.random() < offerRate;
      const accepted = offered && Math.random() < acceptRate;
      await pool.query(
        `INSERT INTO hiring_outcomes (consultant_id, role_family_id, submitted, interviewed, offered, accepted, time_to_fill_days)
         VALUES ($1, $2, true, $3, $4, $5, $6)`,
        [consultantId, roleFamilyId, interviewed, offered, accepted, accepted ? 25 : null]
      );
    }
  }

  test('getRankingsForRoleFamily() requires minimum 3 submissions', async () => {
    const { rows: [salesFamily] } = await pool.query("SELECT id FROM role_families WHERE name = 'Sales'");
    const { rows: [consultant] } = await pool.query(
      "INSERT INTO consultants (firm_name, active) VALUES ('SmallFirm', true) RETURNING *"
    );

    // Only 2 submissions — should not appear
    await seedOutcomes(consultant.id, salesFamily.id, 2, 1.0, 1.0, 1.0);
    const rankings = await YieldCalculator.getRankingsForRoleFamily(salesFamily.id);
    expect(rankings.length).toBe(0);

    // Add 1 more to hit threshold
    await seedOutcomes(consultant.id, salesFamily.id, 1, 1.0, 1.0, 1.0);
    const rankings2 = await YieldCalculator.getRankingsForRoleFamily(salesFamily.id);
    expect(rankings2.length).toBe(1);
    expect(rankings2[0].rank).toBe(1);
  });

  test('getRankingsForRoleFamily() orders by yield desc', async () => {
    const { rows: [salesFamily] } = await pool.query("SELECT id FROM role_families WHERE name = 'Sales'");
    const { rows: [goodFirm] } = await pool.query(
      "INSERT INTO consultants (firm_name, active) VALUES ('GoodFirm', true) RETURNING *"
    );
    const { rows: [badFirm] } = await pool.query(
      "INSERT INTO consultants (firm_name, active) VALUES ('BadFirm', true) RETURNING *"
    );

    // Good firm: all hires
    for (let i = 0; i < 5; i++) {
      await pool.query(
        `INSERT INTO hiring_outcomes (consultant_id, role_family_id, submitted, interviewed, offered, accepted, time_to_fill_days)
         VALUES ($1, $2, true, true, true, true, 20)`,
        [goodFirm.id, salesFamily.id]
      );
    }

    // Bad firm: no hires
    for (let i = 0; i < 5; i++) {
      await pool.query(
        `INSERT INTO hiring_outcomes (consultant_id, role_family_id, submitted, interviewed, offered, accepted)
         VALUES ($1, $2, true, false, false, false)`,
        [badFirm.id, salesFamily.id]
      );
    }

    const rankings = await YieldCalculator.getRankingsForRoleFamily(salesFamily.id);
    expect(rankings.length).toBe(2);
    expect(rankings[0].firm_name).toBe('GoodFirm');
    expect(parseFloat(rankings[0].overall_yield_pct)).toBe(100);
    expect(rankings[1].firm_name).toBe('BadFirm');
    expect(parseFloat(rankings[1].overall_yield_pct)).toBe(0);
  });

  test('recordOutcome() inserts correctly', async () => {
    const { rows: [salesFamily] } = await pool.query("SELECT id FROM role_families WHERE name = 'Sales'");
    const { rows: [consultant] } = await pool.query(
      "INSERT INTO consultants (firm_name, active) VALUES ('RecordFirm', true) RETURNING *"
    );

    const outcome = await YieldCalculator.recordOutcome({
      consultant_id: consultant.id,
      role_family_id: salesFamily.id,
      submitted: true,
      interviewed: true,
      offered: false,
      accepted: false,
    });

    expect(outcome.id).toBeDefined();
    expect(outcome.submitted).toBe(true);
    expect(outcome.interviewed).toBe(true);
    expect(outcome.offered).toBe(false);
  });

  test('suggestConsultants() returns top 3', async () => {
    const { rows: [salesFamily] } = await pool.query("SELECT id FROM role_families WHERE name = 'Sales'");
    const { rows: [requisition] } = await pool.query(
      "INSERT INTO requisitions (title, role_family_id) VALUES ('Test Req', $1) RETURNING *",
      [salesFamily.id]
    );

    // Create 4 consultants with outcomes
    for (let i = 0; i < 4; i++) {
      const { rows: [c] } = await pool.query(
        `INSERT INTO consultants (firm_name, active) VALUES ($1, true) RETURNING *`,
        [`Firm${i}`]
      );
      for (let j = 0; j < 5; j++) {
        await pool.query(
          `INSERT INTO hiring_outcomes (consultant_id, role_family_id, submitted, interviewed, offered, accepted)
           VALUES ($1, $2, true, true, $3, $4)`,
          [c.id, salesFamily.id, i < 3, i < 2]
        );
      }
    }

    const suggestions = await YieldCalculator.suggestConsultants(requisition.id);
    expect(suggestions.length).toBe(3);
    expect(suggestions[0].rank).toBe(1);
  });
});
