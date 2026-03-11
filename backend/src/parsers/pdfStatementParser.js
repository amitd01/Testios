const { parseIndianDate } = require('../utils/indianFormats');

/**
 * Parse PDF bank and credit card statements
 * Uses pdf-parse to extract text, then regex for transaction lines
 * Returns { data, meta } envelope for observability
 */
async function parseBankStatementPDF(pdfBuffer, options = {}) {
  const startTime = Date.now();
  const fieldsExtracted = [];
  const fieldsMissing = [];
  const warnings = [];

  const pdfParse = require('pdf-parse');
  let text;
  try {
    const parseOptions = {};
    if (options.password) {
      parseOptions.password = options.password;
    }
    const data = await pdfParse(pdfBuffer, parseOptions);
    text = data.text;
  } catch (err) {
    if (err.message?.includes('password')) {
      // If we already tried with a password, it's wrong
      if (options.password) {
        return { data: null, meta: { parser: 'pdfStatementParser', duration_ms: Date.now() - startTime, confidence: 0, warnings: ['pdf_wrong_password'], error: 'pdf_wrong_password' } };
      }
      return { data: null, meta: { parser: 'pdfStatementParser', duration_ms: Date.now() - startTime, confidence: 0, warnings: ['pdf_encrypted'], error: 'pdf_encrypted', needs_password: true } };
    }
    throw err;
  }

  // Detect scanned/image PDF
  if (!text || text.replace(/\s/g, '').length < 50) {
    return { data: null, meta: { parser: 'pdfStatementParser', duration_ms: Date.now() - startTime, confidence: 0, warnings: ['pdf_scanned_or_empty'], error: 'pdf_scanned' } };
  }

  const accountLast4 = extractAccountNumber(text);
  const statementPeriod = extractStatementPeriod(text);
  const institutionName = detectInstitution(text);
  const closingBalance = extractClosingBalance(text);
  const transactions = extractTransactions(text, accountLast4);

  if (accountLast4) fieldsExtracted.push('accountLast4'); else fieldsMissing.push('accountLast4');
  if (statementPeriod) fieldsExtracted.push('statementPeriod'); else fieldsMissing.push('statementPeriod');
  if (institutionName !== 'Unknown Bank') fieldsExtracted.push('institutionName'); else { fieldsMissing.push('institutionName'); warnings.push('institution_unknown'); }
  if (closingBalance !== null) fieldsExtracted.push('closingBalance'); else fieldsMissing.push('closingBalance');
  if (transactions.length > 0) fieldsExtracted.push('transactions'); else { fieldsMissing.push('transactions'); warnings.push('no_transactions_found'); }

  let confidence = 0;
  if (transactions.length > 0) confidence += 40;
  if (accountLast4) confidence += 20;
  if (statementPeriod) confidence += 15;
  if (closingBalance !== null) confidence += 15;
  if (institutionName !== 'Unknown Bank') confidence += 10;

  const duration_ms = Date.now() - startTime;

  return {
    data: { accountLast4, statementPeriod, institutionName, closingBalance, transactions },
    meta: { parser: 'pdfStatementParser', duration_ms, fields_extracted: fieldsExtracted, fields_missing: fieldsMissing, confidence, warnings, transactions_count: transactions.length, text_length: text.length },
  };
}

async function parseCreditCardStatementPDF(pdfBuffer, options = {}) {
  const startTime = Date.now();
  const fieldsExtracted = [];
  const fieldsMissing = [];
  const warnings = [];

  const pdfParse = require('pdf-parse');
  let text;
  try {
    const parseOptions = {};
    if (options.password) {
      parseOptions.password = options.password;
    }
    const data = await pdfParse(pdfBuffer, parseOptions);
    text = data.text;
  } catch (err) {
    if (err.message?.includes('password')) {
      if (options.password) {
        return { data: null, meta: { parser: 'pdfCCParser', duration_ms: Date.now() - startTime, confidence: 0, warnings: ['pdf_wrong_password'], error: 'pdf_wrong_password' } };
      }
      return { data: null, meta: { parser: 'pdfCCParser', duration_ms: Date.now() - startTime, confidence: 0, warnings: ['pdf_encrypted'], error: 'pdf_encrypted', needs_password: true } };
    }
    throw err;
  }

  if (!text || text.replace(/\s/g, '').length < 50) {
    return { data: null, meta: { parser: 'pdfCCParser', duration_ms: Date.now() - startTime, confidence: 0, warnings: ['pdf_scanned_or_empty'], error: 'pdf_scanned' } };
  }

  const cardLast4 = extractCardNumber(text);
  const totalDue = extractTotalDue(text);
  const minimumDue = extractMinimumDue(text);
  const dueDate = extractDueDate(text);
  const creditLimit = extractCreditLimit(text);
  const transactions = extractCCTransactions(text, cardLast4);

  if (cardLast4) fieldsExtracted.push('cardLast4'); else fieldsMissing.push('cardLast4');
  if (totalDue !== null) fieldsExtracted.push('totalDue'); else fieldsMissing.push('totalDue');
  if (dueDate) fieldsExtracted.push('dueDate'); else fieldsMissing.push('dueDate');
  if (transactions.length > 0) fieldsExtracted.push('transactions'); else warnings.push('no_transactions_found');

  let confidence = 0;
  if (transactions.length > 0) confidence += 40;
  if (cardLast4) confidence += 20;
  if (totalDue !== null) confidence += 15;
  if (dueDate) confidence += 15;
  if (creditLimit !== null) confidence += 10;

  const duration_ms = Date.now() - startTime;

  return {
    data: { cardLast4, totalDue, minimumDue, dueDate, creditLimit, transactions },
    meta: { parser: 'pdfCCParser', duration_ms, fields_extracted: fieldsExtracted, fields_missing: fieldsMissing, confidence, warnings, transactions_count: transactions.length, text_length: text.length },
  };
}

function extractAccountNumber(text) {
  const patterns = [
    /Account\s*(?:No\.?|Number|#)[\s:]*(\d{4,})/i,
    /A\/c\s*(?:No\.?)?\s*:?\s*(\d{4,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].slice(-4);
  }
  return null;
}

function extractCardNumber(text) {
  const match = text.match(/(?:Card\s*(?:No\.?|Number|#)|ending)[\s:]*(?:\*+|X+)?(\d{4})/i);
  if (match) return match[1];
  const last4 = text.match(/\*{4,}\s*(\d{4})/);
  return last4 ? last4[1] : null;
}

function extractStatementPeriod(text) {
  const match = text.match(/(?:Statement\s+Period|Period|From)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s*(?:to|-)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
  if (match) {
    return {
      from: parseIndianDate(match[1]),
      to: parseIndianDate(match[2]),
    };
  }
  return null;
}

function detectInstitution(text) {
  const institutions = {
    'HDFC Bank': /HDFC\s*Bank/i,
    'ICICI Bank': /ICICI\s*Bank/i,
    'SBI': /State\s*Bank\s*of\s*India|SBI/i,
    'Axis Bank': /Axis\s*Bank/i,
    'Kotak': /Kotak\s*Mahindra/i,
    'Yes Bank': /Yes\s*Bank/i,
    'ICICI Card': /ICICI.*Card/i,
    'HDFC Card': /HDFC.*Card/i,
    'SBI Card': /SBI\s*Card/i,
  };

  for (const [name, pattern] of Object.entries(institutions)) {
    if (pattern.test(text)) return name;
  }
  return 'Unknown Bank';
}

function extractClosingBalance(text) {
  const match = text.match(/(?:Closing|Closing\s+Balance|End\s+Balance)[\s:]*(?:₹|Rs\.?\s*|INR\s*)?([\d,]+\.\d{2})/i);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return null;
}

function extractTotalDue(text) {
  const match = text.match(/(?:Total\s+Amount\s+Due|Total\s+Due|Outstanding)[\s:]*(?:₹|Rs\.?\s*|INR\s*)?([\d,]+\.\d{2})/i);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return null;
}

function extractMinimumDue(text) {
  const match = text.match(/(?:Minimum\s+Amount\s+Due|Min\.?\s+Due)[\s:]*(?:₹|Rs\.?\s*|INR\s*)?([\d,]+\.\d{2})/i);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return null;
}

function extractDueDate(text) {
  const match = text.match(/(?:Due\s+Date|Payment\s+Due)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
  if (match) return parseIndianDate(match[1]);
  return null;
}

function extractCreditLimit(text) {
  const match = text.match(/(?:Credit\s+Limit|Total\s+Limit)[\s:]*(?:₹|Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d{2})?)/i);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return null;
}

function extractTransactions(text, accountLast4) {
  const transactions = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Common bank statement format: DD/MM/YYYY Description Amount Amount Balance
    const match = line.match(
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s+(?:([\d,]+\.\d{2})\s+)?([\d,]+\.\d{2})?/
    );
    if (match) {
      const [, dateStr, description, col1, col2, col3] = match;
      const date = parseIndianDate(dateStr);
      if (!date) continue;

      // Heuristic: if col2 exists, col1 is debit and col2 is credit (or vice versa)
      let amount;
      let txnType;
      if (col2) {
        // Check if col1 is the debit column
        const val1 = parseFloat(col1.replace(/,/g, ''));
        const val2 = parseFloat(col2.replace(/,/g, ''));
        if (val1 > 0 && val2 === 0) {
          amount = -val1;
          txnType = 'debit';
        } else {
          amount = val2;
          txnType = 'credit';
        }
      } else {
        // Single amount column - determine from description
        const isDebit = /debit|dr|paid|purchase|withdrawal|transfer\s+to/i.test(description);
        amount = parseFloat(col1.replace(/,/g, ''));
        if (isDebit) amount = -amount;
        txnType = isDebit ? 'debit' : 'credit';
      }

      transactions.push({
        date,
        merchant: description.trim(),
        amount,
        account_last4: accountLast4,
        transaction_type: txnType,
        balance_after: col3 ? parseFloat(col3.replace(/,/g, '')) : null,
        source: 'statement_pdf',
      });
    }
  }

  return transactions;
}

function extractCCTransactions(text, cardLast4) {
  const transactions = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // CC statement format: DD/MM/YYYY Description Amount
    const match = line.match(
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*$/
    );
    if (match) {
      const [, dateStr, description, amountStr] = match;
      const date = parseIndianDate(dateStr);
      if (!date) continue;

      const amount = parseFloat(amountStr.replace(/,/g, ''));
      const isCredit = /refund|reversal|credit|cashback/i.test(description);

      transactions.push({
        date,
        merchant: description.trim(),
        amount: isCredit ? amount : -amount,
        account_last4: cardLast4,
        account_type: 'credit_card',
        transaction_type: isCredit ? 'credit' : 'debit',
        source: 'statement_pdf',
      });
    }
  }

  return transactions;
}

module.exports = { parseBankStatementPDF, parseCreditCardStatementPDF };
