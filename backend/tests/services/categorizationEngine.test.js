const { categorizeTransaction, getAllCategories } = require('../../src/services/categorizationEngine');

describe('Categorization Engine', () => {
  test('categorizes food merchants', () => {
    expect(categorizeTransaction('Swiggy')).toBe('Food & Dining');
    expect(categorizeTransaction('ZOMATO ORDER')).toBe('Food & Dining');
    expect(categorizeTransaction('Starbucks Coffee')).toBe('Food & Dining');
    expect(categorizeTransaction('Dominos Pizza')).toBe('Food & Dining');
  });

  test('categorizes transportation', () => {
    expect(categorizeTransaction('Uber India')).toBe('Transportation');
    expect(categorizeTransaction('OLA CABS')).toBe('Transportation');
    expect(categorizeTransaction('HP PETROL PUMP')).toBe('Transportation');
    expect(categorizeTransaction('IRCTC')).toBe('Transportation');
  });

  test('categorizes bills & utilities', () => {
    expect(categorizeTransaction('BESCOM ELECTRICITY')).toBe('Bills & Utilities');
    expect(categorizeTransaction('Airtel Postpaid')).toBe('Bills & Utilities');
    expect(categorizeTransaction('Jio Recharge')).toBe('Bills & Utilities');
  });

  test('categorizes shopping', () => {
    expect(categorizeTransaction('Amazon India')).toBe('Shopping');
    expect(categorizeTransaction('FLIPKART PAYMENTS')).toBe('Shopping');
    expect(categorizeTransaction('Myntra Online')).toBe('Shopping');
  });

  test('categorizes entertainment', () => {
    expect(categorizeTransaction('Netflix')).toBe('Entertainment');
    expect(categorizeTransaction('Spotify Premium')).toBe('Entertainment');
    expect(categorizeTransaction('BookMyShow')).toBe('Entertainment');
  });

  test('categorizes investments', () => {
    expect(categorizeTransaction('Zerodha')).toBe('Investments');
    expect(categorizeTransaction('SIP Mutual Fund')).toBe('Investments');
    expect(categorizeTransaction('Groww Investments')).toBe('Investments');
  });

  test('categorizes salary', () => {
    expect(categorizeTransaction('SALARY CREDIT')).toBe('Salary');
  });

  test('returns Uncategorized for unknown merchants', () => {
    expect(categorizeTransaction('Random Store XYZ')).toBe('Uncategorized');
  });

  test('handles null/empty merchant', () => {
    expect(categorizeTransaction(null)).toBe('Uncategorized');
    expect(categorizeTransaction('')).toBe('Uncategorized');
  });

  test('getAllCategories returns all categories', () => {
    const categories = getAllCategories();
    expect(categories).toContain('Food & Dining');
    expect(categories).toContain('Transportation');
    expect(categories).toContain('Investments');
    expect(categories.length).toBeGreaterThan(10);
  });
});
