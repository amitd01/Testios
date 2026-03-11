const { parseIndianDate } = require('../utils/indianFormats');

/**
 * Parse bill payment reminder emails
 * Returns { data, meta } envelope for observability
 */
function parseBillReminder(emailBody, sender, subject, senderInfo = null) {
  const startTime = Date.now();
  const fieldsExtracted = [];
  const fieldsMissing = [];
  const warnings = [];

  const text = typeof emailBody === 'string'
    ? emailBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const combined = (subject || '') + ' ' + text;

  const billerName = senderInfo?.name || extractBillerName(combined);
  const billType = detectBillType(combined, senderInfo);
  const amount = extractBillAmount(combined);
  const dueDate = extractDueDate(combined);
  const accountNumber = extractAccountNumber(combined, billType);
  const recurrence = detectRecurrence(combined, billType);

  if (billerName) fieldsExtracted.push('biller_name'); else fieldsMissing.push('biller_name');
  if (amount !== null) fieldsExtracted.push('amount'); else fieldsMissing.push('amount');
  if (dueDate) fieldsExtracted.push('due_date'); else fieldsMissing.push('due_date');
  if (accountNumber) fieldsExtracted.push('account_number'); else fieldsMissing.push('account_number');
  if (billType !== 'other') fieldsExtracted.push('bill_type');

  let confidence = 0;
  if (billerName) confidence += 25;
  if (amount !== null) confidence += 30;
  if (dueDate) confidence += 25;
  if (accountNumber) confidence += 10;
  if (billType !== 'other') confidence += 10;

  const duration_ms = Date.now() - startTime;

  if (!billerName && !amount && !dueDate) {
    return {
      data: null,
      meta: { parser: 'billReminderParser', duration_ms, fields_extracted: fieldsExtracted, fields_missing: fieldsMissing, confidence: 0, warnings: ['no_bill_data_found'] },
    };
  }

  return {
    data: {
      biller_name: billerName || 'Unknown Biller',
      bill_type: billType,
      amount,
      due_date: dueDate,
      account_number: accountNumber,
      recurrence,
      source: 'bill_reminder',
      metadata: { sender },
    },
    meta: { parser: 'billReminderParser', duration_ms, fields_extracted: fieldsExtracted, fields_missing: fieldsMissing, confidence, warnings },
  };
}

function extractBillerName(text) {
  const billerPatterns = [
    { pattern: /BESCOM/i, name: 'BESCOM' },
    { pattern: /MSEDCL|mahadiscom/i, name: 'MSEDCL' },
    { pattern: /Tata\s*Power/i, name: 'Tata Power' },
    { pattern: /Airtel/i, name: 'Airtel' },
    { pattern: /Jio/i, name: 'Jio' },
    { pattern: /Vodafone|Vi\b/i, name: 'Vodafone' },
    { pattern: /BSNL/i, name: 'BSNL' },
    { pattern: /Netflix/i, name: 'Netflix' },
    { pattern: /Amazon\s*Prime/i, name: 'Amazon Prime' },
    { pattern: /Spotify/i, name: 'Spotify' },
    { pattern: /Hotstar|Disney/i, name: 'Disney+ Hotstar' },
    { pattern: /LIC/i, name: 'LIC' },
    { pattern: /HDFC\s*Life/i, name: 'HDFC Life' },
    { pattern: /ICICI\s*Pru/i, name: 'ICICI Prudential' },
  ];

  for (const { pattern, name } of billerPatterns) {
    if (pattern.test(text)) return name;
  }
  return null;
}

function detectBillType(text, senderInfo) {
  if (/electric|power|BESCOM|MSEDCL|unit.*consumed/i.test(text)) return 'electricity';
  if (/gas\s*bill|piped\s*gas/i.test(text)) return 'gas';
  if (/water\s*bill/i.test(text)) return 'water';
  if (/mobile|recharge|prepaid|postpaid|data\s*plan/i.test(text)) return 'mobile';
  if (/broadband|internet|fiber|wifi/i.test(text)) return 'broadband';
  if (/DTH|dish|tatasky/i.test(text)) return 'dth';
  if (/insurance|premium|policy/i.test(text)) return 'insurance';
  if (/Netflix|Amazon\s*Prime|Spotify|Hotstar|subscription/i.test(text)) return 'subscription';
  if (/EMI|loan|instalment/i.test(text)) return 'loan_emi';
  if (/rent/i.test(text)) return 'rent';

  if (senderInfo?.type === 'biller') return 'utility';
  return 'other';
}

function extractBillAmount(text) {
  const patterns = [
    /(?:Amount|Bill\s*Amount|Total|Amount\s*Due|Pay)[:\s]*(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/i,
    /(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)(?:\s*(?:is\s+)?due)/i,
    /(?:is|of)\s+(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/i,
    /(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)\s+(?:will|for|is)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseFloat(match[1].replace(/,/g, ''));
  }
  return null;
}

function extractDueDate(text) {
  const patterns = [
    /(?:due\s*(?:date|on|by)|pay\s*(?:before|by)|last\s*date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /(?:due\s*(?:date|on|by)|pay\s*(?:before|by))[:\s]*(\d{1,2}\s+\w{3,9}\s+\d{4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})(?:\s*(?:is\s+)?(?:the\s+)?due)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseIndianDate(match[1]);
  }
  return null;
}

function extractAccountNumber(text, billType) {
  const patterns = [
    /(?:service\s*connection|consumer\s*(?:no|number)|account\s*(?:no|number|#)|CA\s*No)[:\s]*(\d{5,})/i,
    /(?:mobile|phone)[:\s]*(\d{10})/i,
    /(?:policy\s*(?:no|number))[:\s]*(\w{5,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function detectRecurrence(text, billType) {
  if (/monthly|every\s*month/i.test(text)) return 'monthly';
  if (/quarterly|every\s*3\s*months/i.test(text)) return 'quarterly';
  if (/yearly|annual|every\s*year/i.test(text)) return 'yearly';

  // Default based on bill type
  const monthlyTypes = ['electricity', 'gas', 'water', 'mobile', 'broadband', 'subscription', 'loan_emi', 'rent'];
  if (monthlyTypes.includes(billType)) return 'monthly';
  if (billType === 'insurance') return 'yearly';
  return 'monthly';
}

module.exports = { parseBillReminder };
