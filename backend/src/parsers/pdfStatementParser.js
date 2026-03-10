const { parseIndianDate } = require('../utils/indianFormats');

/**
 * Parse PDF bank and credit card statements
 * Uses pdf-parse to extract text, then regex for transaction lines
 */
async function parseBankStatementPDF(pdfBuffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(pdfBuffer);
  const text = data.text;

  const accountLast4 = extractAccountNumber(text);
  const statementPeriod = extractStatementPeriod(text);
  const institutionName = detectInstitution(text);
  const closingBalance = extractClosingBalance(text);
  const transactions = extractTransactions(text, accountLast4);

  return {
    accountLast4,
    statementPeriod,
    institutionName,
    closingBalance,
    transactions,
  };
}

async function parseCreditCardStatementPDF(pdfBuffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(pdfBuffer);
  const text = data.text;

  const cardLast4 = extractCardNumber(text);
  const totalDue = extractTotalDue(text);
  const minimumDue = extractMinimumDue(text);
  const dueDate = extractDueDate(text);
  const creditLimit = extractCreditLimit(text);
  const transactions = extractCCTransactions(text, cardLast4);

  return {
    cardLast4,
    totalDue,
    minimumDue,
    dueDate,
    creditLimit,
    transactions,
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
