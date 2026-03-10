const { isSameTransaction } = require('../../src/services/deduplicationEngine');

describe('Deduplication Engine', () => {
  describe('isSameTransaction', () => {
    test('matches identical transactions', () => {
      const a = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      const b = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      expect(isSameTransaction(a, b)).toBe(true);
    });

    test('matches transactions with 1 day difference', () => {
      const a = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      const b = { amount: -520, date: '2026-03-18', account_last4: '1234', transaction_type: 'debit' };
      expect(isSameTransaction(a, b)).toBe(true);
    });

    test('rejects transactions with >1 day difference', () => {
      const a = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      const b = { amount: -520, date: '2026-03-20', account_last4: '1234', transaction_type: 'debit' };
      expect(isSameTransaction(a, b)).toBe(false);
    });

    test('rejects different amounts', () => {
      const a = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      const b = { amount: -530, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      expect(isSameTransaction(a, b)).toBe(false);
    });

    test('rejects different accounts', () => {
      const a = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      const b = { amount: -520, date: '2026-03-17', account_last4: '5678', transaction_type: 'debit' };
      expect(isSameTransaction(a, b)).toBe(false);
    });

    test('matches when one has no account', () => {
      const a = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      const b = { amount: -520, date: '2026-03-17', account_last4: null, transaction_type: 'debit' };
      expect(isSameTransaction(a, b)).toBe(true);
    });

    test('rejects different transaction types', () => {
      const a = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      const b = { amount: 520, date: '2026-03-17', account_last4: '1234', transaction_type: 'credit' };
      expect(isSameTransaction(a, b)).toBe(false);
    });

    test('matches absolute amounts for alert vs statement', () => {
      const a = { amount: 520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      const b = { amount: -520, date: '2026-03-17', account_last4: '1234', transaction_type: 'debit' };
      expect(isSameTransaction(a, b)).toBe(true);
    });
  });
});
