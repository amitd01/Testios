process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hiring_pipeline_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ANTHROPIC_API_KEY = '';

const TriageService = require('../../src/services/triageService');

describe('TriageService', () => {
  const requisition = {
    title: 'Senior Sales Engineer',
    description: 'Sell enterprise SaaS to manufacturing companies in western India',
    field_expectations: '60% travel across Maharashtra and Gujarat, visiting factory floors',
    compensation_range: '18-24 LPA',
    team_info: 'Team of 5 field engineers',
  };

  test('scoreMock() returns valid structure', () => {
    const submission = {
      consultant_rationale: 'Strong sales track record, 6 years selling SaaS. Based in Mumbai, comfortable with travel.',
      candidate_name: 'Test Candidate',
    };
    const result = TriageService.scoreMock(submission, requisition);

    expect(result.fit_score).toBeGreaterThanOrEqual(0);
    expect(result.fit_score).toBeLessThanOrEqual(100);
    expect(result.dimensions).toBeDefined();
    expect(result.dimensions.role_relevance).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.role_relevance).toBeLessThanOrEqual(20);
    expect(result.dimensions.experience_depth).toBeDefined();
    expect(result.dimensions.location_fit).toBeDefined();
    expect(result.dimensions.compensation_alignment).toBeDefined();
    expect(result.dimensions.culture_signals).toBeDefined();
    expect(result.summary).toBeTruthy();
    expect(result.method).toBe('rule-based');
  });

  test('scoreMock() dimensions sum to fit_score', () => {
    const submission = {
      consultant_rationale: 'Experienced engineer with 10 years at Oracle',
      candidate_name: 'Another Candidate',
    };
    const result = TriageService.scoreMock(submission, requisition);
    const dimSum = Object.values(result.dimensions).reduce((a, b) => a + b, 0);
    expect(dimSum).toBe(result.fit_score);
  });

  test('scoreMock() gives higher scores for better matches', () => {
    const goodMatch = TriageService.scoreMock({
      consultant_rationale: 'Top sales performer, 8 years selling SaaS to manufacturing. Based in Mumbai, travels 60% already. Comfortable with 18-24 LPA range. Very motivated and autonomous.',
      candidate_name: 'Good Candidate',
    }, requisition);

    const weakMatch = TriageService.scoreMock({
      consultant_rationale: 'Junior developer, 1 year experience. Based in Kolkata. Asking for 40 LPA which exceeds budget.',
      candidate_name: 'Weak Candidate',
    }, requisition);

    expect(goodMatch.fit_score).toBeGreaterThan(weakMatch.fit_score);
  });

  test('scoreMock() detects compensation red flags', () => {
    const overbudget = TriageService.scoreMock({
      consultant_rationale: 'Candidate asking 30+ LPA which exceeds budget. Unrealistic expectations.',
      candidate_name: 'Expensive Candidate',
    }, requisition);

    expect(overbudget.dimensions.compensation_alignment).toBeLessThan(10);
  });

  test('score() falls back to mock when no API key', async () => {
    const result = await TriageService.score(
      { consultant_rationale: 'Good sales candidate', candidate_name: 'Test' },
      requisition
    );
    expect(result.method).toBe('rule-based');
  });
});
