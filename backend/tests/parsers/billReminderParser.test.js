const { parseBillReminder } = require('../../src/parsers/billReminderParser');

describe('Bill Reminder Parser', () => {
  test('parses BESCOM electricity bill', () => {
    const body = `Your bill for service connection 123456789 is due on 25-03-2026.
Amount: Rs 1,450.00
Pay before due date to avoid late fee.`;
    const sender = 'noreply@bescom.co.in';
    const subject = 'Your electricity bill is due';

    const result = parseBillReminder(body, sender, subject);

    expect(result).not.toBeNull();
    expect(result.biller_name).toBe('BESCOM');
    expect(result.bill_type).toBe('electricity');
    expect(result.due_date).toBe('2026-03-25');
    expect(result.amount).toBe(1450.00);
    expect(result.account_number).toBe('123456789');
    expect(result.recurrence).toBe('monthly');
  });

  test('parses Airtel mobile bill', () => {
    const body = `Dear Customer, Your Airtel mobile bill for 9876543210 is Rs. 599.00.
Due date: 20/03/2026. Pay now to avoid disconnection.`;
    const sender = 'noreply@airtel.in';
    const subject = 'Airtel Bill Payment Reminder';

    const result = parseBillReminder(body, sender, subject);

    expect(result).not.toBeNull();
    expect(result.biller_name).toBe('Airtel');
    expect(result.bill_type).toBe('mobile');
    expect(result.amount).toBe(599.00);
    expect(result.due_date).toBe('2026-03-20');
  });

  test('parses Netflix subscription reminder', () => {
    const body = `Your Netflix subscription of Rs 649 will renew on 01/04/2026.`;
    const sender = 'noreply@netflix.com';
    const subject = 'Netflix subscription renewal';

    const result = parseBillReminder(body, sender, subject);

    expect(result).not.toBeNull();
    expect(result.biller_name).toBe('Netflix');
    expect(result.bill_type).toBe('subscription');
    expect(result.amount).toBe(649.00);
  });

  test('parses insurance premium reminder', () => {
    const body = `Dear Policyholder, Your LIC premium of Rs 12,500 for policy no. LIC12345678 is due on 15-04-2026.`;
    const sender = 'noreply@licindia.in';
    const subject = 'Premium Due Reminder';

    const result = parseBillReminder(body, sender, subject);

    expect(result).not.toBeNull();
    expect(result.biller_name).toBe('LIC');
    expect(result.bill_type).toBe('insurance');
    expect(result.amount).toBe(12500.00);
    expect(result.recurrence).toBe('yearly');
  });

  test('returns null for unparseable email', () => {
    const result = parseBillReminder('General newsletter content', 'news@random.com', 'Newsletter');
    expect(result).toBeNull();
  });
});
