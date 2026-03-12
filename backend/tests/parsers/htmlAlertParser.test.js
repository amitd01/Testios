const { parseTransactionAlert, extractAmount, extractDate, extractAccountLast4, extractMerchant } = require('../../src/parsers/htmlAlertParser');

describe('HTML Alert Parser', () => {
  describe('parseTransactionAlert', () => {
    test('parses HDFC Bank debit alert', () => {
      const body = `Dear Customer,
Your A/c XX1234 has been debited with Rs 520.00 on 17-03-2026 15:23:45.
Info: UPI/P2P/426532198745/swiggy@paytm
Available Balance: Rs 45,230.50`;
      const sender = 'alerts@hdfcbank.net';
      const subject = 'Alert: Rs 520.00 debited from A/c XX1234';

      const result = parseTransactionAlert(body, sender, subject);

      expect(result).not.toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data.amount).toBe(-520.00);
      expect(result.data.date).toBe('2026-03-17');
      expect(result.data.account_last4).toBe('1234');
      expect(result.data.transaction_type).toBe('debit');
      expect(result.data.balance_after).toBe(45230.50);
      expect(result.data.payment_method).toBe('UPI');
      expect(result.data.source).toBe('email_alert');
    });

    test('parses ICICI Bank credit alert', () => {
      const body = `Dear Customer, Your Account XXXX5678 has been credited with INR 25,000.00 on 15/03/2026. NEFT received from ACME Corp. Avl Bal: Rs 1,25,000.50`;
      const sender = 'alerts@icicibank.com';
      const subject = 'Transaction Alert';

      const result = parseTransactionAlert(body, sender, subject);

      expect(result).not.toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data.amount).toBe(25000.00);
      expect(result.data.account_last4).toBe('5678');
      expect(result.data.transaction_type).toBe('credit');
      expect(result.data.payment_method).toBe('NEFT');
    });

    test('parses SBI UPI debit alert', () => {
      const body = `Your a/c no. XX9876 is debited for Rs.150.00 on 10-03-2026 by a]UPI txn. Ref No 412345678901. If not done by u, call 1800112211.`;
      const sender = 'noreply@sbi.co.in';

      const result = parseTransactionAlert(body, sender, 'SBI Debit Alert');

      expect(result).not.toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data.amount).toBe(-150.00);
      expect(result.data.account_last4).toBe('9876');
      expect(result.data.transaction_type).toBe('debit');
      expect(result.data.payment_method).toBe('UPI');
    });

    test('parses Axis Bank IMPS alert', () => {
      const body = `Dear Customer, Rs 3,500.00 has been debited from your Account 4321 via IMPS to John Doe on 20-03-2026. Available Balance: Rs 67,890.25`;
      const sender = 'alerts@axisbank.com';

      const result = parseTransactionAlert(body, sender, 'Transaction Alert');

      expect(result).not.toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data.amount).toBe(-3500.00);
      expect(result.data.account_last4).toBe('4321');
      expect(result.data.payment_method).toBe('IMPS');
    });

    test('parses credit card swipe alert', () => {
      const body = `Your ICICI Card ending 4567 was used for a purchase of Rs 1,299.00 at AMAZON INDIA on 16-Mar-2026.`;
      const sender = 'alerts@icicibankcard.com';

      const result = parseTransactionAlert(body, sender, 'Credit Card Alert');

      expect(result).not.toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data.amount).toBe(-1299.00);
      expect(result.data.account_last4).toBe('4567');
      expect(result.data.account_type).toBe('credit_card');
      expect(result.data.transaction_type).toBe('debit');
    });

    test('returns null data for unparseable email', () => {
      const result = parseTransactionAlert('Welcome to our newsletter!', 'news@example.com', 'Newsletter');
      expect(result.data).toBeNull();
    });
  });

  describe('extractAmount', () => {
    test('extracts ₹ amounts', () => {
      expect(extractAmount('₹520.00')).toBe(520.00);
    });

    test('extracts Rs amounts with commas', () => {
      expect(extractAmount('Rs 1,25,000.50')).toBe(125000.50);
    });

    test('extracts INR amounts', () => {
      expect(extractAmount('INR 3500.00')).toBe(3500.00);
    });

    test('extracts Rs. amounts', () => {
      expect(extractAmount('Rs. 999')).toBe(999);
    });

    test('returns null for no amount', () => {
      expect(extractAmount('no amount here')).toBeNull();
    });
  });

  describe('extractDate', () => {
    test('extracts DD-MM-YYYY format', () => {
      expect(extractDate('on 17-03-2026 at 15:23')).toBe('2026-03-17');
    });

    test('extracts DD/MM/YYYY format', () => {
      expect(extractDate('date: 15/03/2026')).toBe('2026-03-15');
    });

    test('extracts DD MMM YYYY format', () => {
      expect(extractDate('on 16 Mar 2026')).toBe('2026-03-16');
    });
  });

  describe('extractAccountLast4', () => {
    test('extracts XX1234 format', () => {
      expect(extractAccountLast4('A/c XX1234')).toBe('1234');
    });

    test('extracts Account ending format', () => {
      expect(extractAccountLast4('Account ending 5678')).toBe('5678');
    });

    test('extracts Card 4567 format', () => {
      expect(extractAccountLast4('Card 4567 was used')).toBe('4567');
    });
  });

  describe('extractMerchant', () => {
    test('extracts from UPI reference', () => {
      expect(extractMerchant('Info: UPI/P2P/426532198745/swiggy@paytm')).toBeTruthy();
    });

    test('extracts from "at" clause', () => {
      const result = extractMerchant('purchase at AMAZON INDIA on 16-Mar-2026');
      expect(result).toBeTruthy();
    });
  });
});
