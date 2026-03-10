const { formatINR, parseIndianDate, formatIndianDate, parseINRAmount } = require('../../src/utils/indianFormats');

describe('Indian Formats', () => {
  describe('formatINR', () => {
    test('formats small amounts', () => {
      expect(formatINR(520)).toBe('₹520.00');
    });

    test('formats amounts with Indian grouping', () => {
      expect(formatINR(100000)).toBe('₹1,00,000.00');
    });

    test('formats large amounts', () => {
      expect(formatINR(12345678)).toBe('₹1,23,45,678.00');
    });

    test('formats negative amounts', () => {
      expect(formatINR(-520)).toBe('-₹520.00');
    });

    test('handles null', () => {
      expect(formatINR(null)).toBe('₹0');
    });

    test('handles zero', () => {
      expect(formatINR(0)).toBe('₹0.00');
    });

    test('formats decimal amounts', () => {
      expect(formatINR(45230.50)).toBe('₹45,230.50');
    });
  });

  describe('parseIndianDate', () => {
    test('parses DD/MM/YYYY', () => {
      expect(parseIndianDate('17/03/2026')).toBe('2026-03-17');
    });

    test('parses DD-MM-YYYY', () => {
      expect(parseIndianDate('17-03-2026')).toBe('2026-03-17');
    });

    test('parses DD MMM YYYY', () => {
      expect(parseIndianDate('17 Mar 2026')).toBe('2026-03-17');
    });

    test('parses single digit day', () => {
      expect(parseIndianDate('5/03/2026')).toBe('2026-03-05');
    });

    test('returns null for invalid', () => {
      expect(parseIndianDate('invalid')).toBeNull();
      expect(parseIndianDate(null)).toBeNull();
    });
  });

  describe('formatIndianDate', () => {
    test('formats to DD MMM YYYY', () => {
      expect(formatIndianDate('2026-03-17')).toBe('17 Mar 2026');
    });
  });

  describe('parseINRAmount', () => {
    test('parses ₹ amounts', () => {
      expect(parseINRAmount('₹520.00')).toBe(520.00);
    });

    test('parses Rs amounts', () => {
      expect(parseINRAmount('Rs 1,450.00')).toBe(1450.00);
    });

    test('parses INR amounts', () => {
      expect(parseINRAmount('INR 25000')).toBe(25000);
    });

    test('returns null for no amount', () => {
      expect(parseINRAmount('no amount')).toBeNull();
    });
  });
});
