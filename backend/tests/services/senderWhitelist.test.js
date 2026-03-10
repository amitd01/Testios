const { isWhitelistedSender, getSenderInfo, getDomainFromEmail, getGmailSearchQuery } = require('../../src/services/senderWhitelist');

describe('Sender Whitelist', () => {
  describe('isWhitelistedSender', () => {
    test('allows bank emails', () => {
      expect(isWhitelistedSender('alerts@hdfcbank.net')).toBe(true);
      expect(isWhitelistedSender('noreply@icicibank.com')).toBe(true);
      expect(isWhitelistedSender('alerts@sbi.co.in')).toBe(true);
    });

    test('allows credit card emails', () => {
      expect(isWhitelistedSender('alerts@cards.hdfcbank.com')).toBe(true);
    });

    test('allows UPI emails', () => {
      expect(isWhitelistedSender('noreply@phonepe.com')).toBe(true);
    });

    test('allows biller emails', () => {
      expect(isWhitelistedSender('noreply@bescom.co.in')).toBe(true);
      expect(isWhitelistedSender('billing@airtel.in')).toBe(true);
    });

    test('rejects personal emails', () => {
      expect(isWhitelistedSender('john@gmail.com')).toBe(false);
      expect(isWhitelistedSender('priya@yahoo.com')).toBe(false);
    });

    test('rejects random domains', () => {
      expect(isWhitelistedSender('news@random.com')).toBe(false);
    });

    test('handles null/invalid', () => {
      expect(isWhitelistedSender(null)).toBe(false);
      expect(isWhitelistedSender('')).toBe(false);
    });
  });

  describe('getSenderInfo', () => {
    test('returns bank info', () => {
      const info = getSenderInfo('alerts@hdfcbank.net');
      expect(info).not.toBeNull();
      expect(info.name).toBe('HDFC Bank');
      expect(info.type).toBe('bank');
    });

    test('returns credit card info', () => {
      const info = getSenderInfo('alerts@sbicard.com');
      expect(info).not.toBeNull();
      expect(info.type).toBe('credit_card');
    });

    test('returns null for unknown', () => {
      expect(getSenderInfo('unknown@gmail.com')).toBeNull();
    });
  });

  describe('getDomainFromEmail', () => {
    test('extracts domain', () => {
      expect(getDomainFromEmail('alerts@hdfcbank.net')).toBe('hdfcbank.net');
    });

    test('handles null', () => {
      expect(getDomainFromEmail(null)).toBeNull();
    });
  });

  describe('getGmailSearchQuery', () => {
    test('generates search query with domains', () => {
      const query = getGmailSearchQuery();
      expect(query).toContain('from:');
      expect(query).toContain('hdfcbank.net');
      expect(query).toContain('icicibank.com');
    });
  });
});
