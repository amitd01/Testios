const { parseIndianDate } = require('../utils/indianFormats');

/**
 * Parse Excel bank statements using xlsx library
 */
async function parseExcelStatement(buffer) {
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Find header row
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) return { transactions: [], accountLast4: null };

  const headers = normalizeHeaders(rows[headerIdx]);
  const transactions = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(cell => !cell)) continue;

    const txn = mapRowToTransaction(row, headers);
    if (txn) transactions.push(txn);
  }

  return { transactions, accountLast4: null };
}

function findHeaderRow(rows) {
  const headerKeywords = ['date', 'description', 'narration', 'amount', 'debit', 'credit', 'balance'];
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map(cell => String(cell).toLowerCase());
    const matches = headerKeywords.filter(kw => row.some(cell => cell.includes(kw)));
    if (matches.length >= 2) return i;
  }
  return -1;
}

function normalizeHeaders(headerRow) {
  return headerRow.map(h => {
    const lower = String(h).toLowerCase().trim();
    if (/date|txn.*date|transaction.*date|value.*date/i.test(lower)) return 'date';
    if (/description|narration|particular|detail|remark/i.test(lower)) return 'description';
    if (/debit|withdrawal|dr/i.test(lower)) return 'debit';
    if (/credit|deposit|cr/i.test(lower)) return 'credit';
    if (/amount/i.test(lower)) return 'amount';
    if (/balance|closing/i.test(lower)) return 'balance';
    if (/ref|reference|cheque/i.test(lower)) return 'reference';
    return lower;
  });
}

function mapRowToTransaction(row, headers) {
  const get = (field) => {
    const idx = headers.indexOf(field);
    return idx >= 0 ? row[idx] : null;
  };

  const dateStr = get('date');
  if (!dateStr) return null;

  const date = parseIndianDate(String(dateStr));
  if (!date) return null;

  const description = String(get('description') || '').trim();
  if (!description) return null;

  const debit = parseNum(get('debit'));
  const credit = parseNum(get('credit'));
  const amount = parseNum(get('amount'));
  const balance = parseNum(get('balance'));

  let txnAmount;
  let txnType;

  if (debit != null && debit > 0) {
    txnAmount = -debit;
    txnType = 'debit';
  } else if (credit != null && credit > 0) {
    txnAmount = credit;
    txnType = 'credit';
  } else if (amount != null) {
    txnAmount = amount;
    txnType = amount < 0 ? 'debit' : 'credit';
  } else {
    return null;
  }

  return {
    date,
    merchant: description,
    amount: txnAmount,
    transaction_type: txnType,
    balance_after: balance,
    source: 'statement_excel',
  };
}

function parseNum(val) {
  if (val == null || val === '') return null;
  const num = parseFloat(String(val).replace(/[,₹Rs.\s]/g, ''));
  return isNaN(num) ? null : num;
}

module.exports = { parseExcelStatement };
