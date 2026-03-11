const { validateAmount, validateDate, validateAccountLast4 } = require('./validators');

const VALID_FINANCIAL_TYPES = ['debit', 'credit', 'investment', 'bill', 'insurance_premium', 'loan_emi', 'refund', 'cashback', 'salary', 'transfer'];
const VALID_INSTRUMENT_TYPES = ['savings_account', 'current_account', 'credit_card', 'upi', 'wallet', 'mutual_fund', 'fixed_deposit', 'insurance_policy', 'loan_account', 'demat'];
const VALID_DATE_SOURCES = ['body_explicit', 'body_inferred', 'subject', 'header_only'];
const VALID_BILL_INSTRUMENT_TYPES = ['utility', 'telecom', 'insurance_policy', 'subscription', 'loan_account', 'credit_card', 'other'];

const SCHEMAS = {
  // Legacy v1 schema (kept for backward compat)
  transaction_alert: {
    required: ['amount', 'transaction_type'],
    optional: ['date', 'merchant', 'account_last4', 'payment_method', 'balance_after', 'account_type'],
    validators: {
      amount: (v) => validateAmount(v),
      date: (v) => validateDate(v),
      account_last4: (v) => validateAccountLast4(v),
      transaction_type: (v) => ({ valid: ['debit', 'credit'].includes(v), reason: 'invalid_type' }),
    },
  },

  // Hierarchical v2 schema
  transaction_alert_v2: {
    required: ['type', 'amount'],
    optional: ['instrument_type', 'date', 'date_source', 'merchant', 'merchant_raw', 'account_last4', 'payment_method', 'balance_after', 'extras'],
    validators: {
      type: (v) => ({ valid: VALID_FINANCIAL_TYPES.includes(v), reason: `invalid_type: must be one of ${VALID_FINANCIAL_TYPES.join(', ')}` }),
      instrument_type: (v) => ({ valid: VALID_INSTRUMENT_TYPES.includes(v), reason: `invalid_instrument: must be one of ${VALID_INSTRUMENT_TYPES.join(', ')}` }),
      amount: (v) => validateAmount(v),
      date: (v) => validateDate(v),
      date_source: (v) => ({ valid: VALID_DATE_SOURCES.includes(v), reason: 'invalid_date_source' }),
      account_last4: (v) => validateAccountLast4(v),
    },
  },

  bill_reminder_v2: {
    required: ['biller_name'],
    optional: ['type', 'instrument_type', 'bill_type', 'amount', 'due_date', 'account_number', 'recurrence'],
    validators: {
      amount: (v) => v === null ? { valid: true } : validateAmount(v),
      due_date: (v) => v === null ? { valid: true } : validateDate(v),
      instrument_type: (v) => ({ valid: VALID_BILL_INSTRUMENT_TYPES.includes(v), reason: 'invalid_bill_instrument' }),
    },
  },

  bank_statement_pdf: {
    required: ['transactions'],
    optional: ['accountLast4', 'institutionName', 'statementPeriod', 'closingBalance'],
    validators: {
      transactions: (v) => ({ valid: Array.isArray(v), reason: 'not_array' }),
      closingBalance: (v) => v === null ? { valid: true } : validateAmount(v),
    },
  },

  cc_statement_pdf: {
    required: ['transactions'],
    optional: ['cardLast4', 'totalDue', 'minimumDue', 'dueDate', 'creditLimit'],
    validators: {
      transactions: (v) => ({ valid: Array.isArray(v), reason: 'not_array' }),
    },
  },

  bill_reminder: {
    required: ['biller_name'],
    optional: ['bill_type', 'amount', 'due_date', 'account_number', 'recurrence'],
    validators: {
      amount: (v) => v === null ? { valid: true } : validateAmount(v),
      due_date: (v) => v === null ? { valid: true } : validateDate(v),
    },
  },

  excel_statement: {
    required: ['transactions'],
    optional: [],
    validators: {
      transactions: (v) => ({ valid: Array.isArray(v), reason: 'not_array' }),
    },
  },

  classify_sender: {
    required: ['is_financial'],
    optional: ['institution_name', 'institution_type', 'confidence'],
    validators: {
      is_financial: (v) => ({ valid: typeof v === 'boolean', reason: 'not_boolean' }),
    },
  },
};

function validateLLMResponse(parsed, contentType) {
  const schema = SCHEMAS[contentType];
  if (!schema) {
    return { valid: false, confidence: 0, errors: ['unknown_content_type'], fieldsPresent: [], fieldsMissing: [], warnings: [] };
  }

  const errors = [];
  const warnings = [];
  const fieldsPresent = [];
  const fieldsMissing = [];

  // Check required fields
  for (const field of schema.required) {
    if (parsed[field] === undefined || parsed[field] === null) {
      errors.push(`missing_required: ${field}`);
      fieldsMissing.push(field);
    } else {
      fieldsPresent.push(field);
    }
  }

  // Check optional fields
  for (const field of schema.optional) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      fieldsPresent.push(field);
    } else {
      fieldsMissing.push(field);
    }
  }

  // Run validators
  for (const [field, validator] of Object.entries(schema.validators || {})) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      const result = validator(parsed[field]);
      if (!result.valid) {
        warnings.push(`validation_failed: ${field} (${result.reason})`);
      }
    }
  }

  // Type-instrument consistency check (v2 schemas only)
  if (contentType === 'transaction_alert_v2' && parsed.type && parsed.instrument_type) {
    const TYPE_INSTRUMENT_MAP = {
      investment: ['mutual_fund', 'fixed_deposit', 'demat', 'savings_account'],
      insurance_premium: ['insurance_policy', 'savings_account', 'credit_card'],
      loan_emi: ['loan_account', 'savings_account'],
      salary: ['savings_account', 'current_account'],
    };
    const allowed = TYPE_INSTRUMENT_MAP[parsed.type];
    if (allowed && !allowed.includes(parsed.instrument_type)) {
      warnings.push(`type_instrument_mismatch: ${parsed.type} typically uses ${allowed.join('/')}, got ${parsed.instrument_type}`);
    }
  }

  // Reject hallucinated data
  if (parsed.amount && typeof parsed.amount === 'number' && Math.abs(parsed.amount) > 10000000) {
    warnings.push('amount_suspiciously_large');
  }
  if (parsed.date) {
    const d = new Date(parsed.date);
    const now = new Date();
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    if (d > now) {
      warnings.push('future_date_detected');
      parsed.date = null;
    }
    if (d < fiveYearsAgo) {
      warnings.push('date_too_old');
      parsed.date = null;
    }
  }
  // Same for due_date
  if (parsed.due_date) {
    const d = new Date(parsed.due_date);
    const now = new Date();
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
    if (d > sixMonthsFromNow) {
      warnings.push('due_date_too_far');
      parsed.due_date = null;
    }
  }

  // Reject garbage merchant names from LLM
  if (parsed.merchant) {
    const garbageNames = /^(know more|more details?|click here|view details?|see more|learn more|check now|pay now|download|unsubscribe|dear customer|important|transaction alert|update|your account.*)$/i;
    if (garbageNames.test(parsed.merchant.trim())) {
      warnings.push('garbage_merchant_name');
      parsed.merchant = null;
    }
    // Reject merchant names containing bank/card preamble
    if (parsed.merchant && /\b(credit card|debit card|ending\s+\d{4}|a\/c\s+\d)/i.test(parsed.merchant)) {
      const towardsMatch = parsed.merchant.match(/towards\s+(.+)/i);
      if (towardsMatch) {
        parsed.merchant = towardsMatch[1].trim().replace(/in$/i, '').trim();
      } else {
        warnings.push('merchant_looks_like_subject');
        parsed.merchant = null;
      }
    }
    // Reject merchant names containing 4+ digit numbers
    if (parsed.merchant && /\d{4,}/.test(parsed.merchant)) {
      parsed.merchant = parsed.merchant.split(/\s+/).filter(w => !/\d{4,}/.test(w)).join(' ').trim();
      if (!parsed.merchant) parsed.merchant = null;
      warnings.push('merchant_name_had_numbers');
    }
    // Strip company suffixes
    if (parsed.merchant) {
      parsed.merchant = parsed.merchant
        .replace(/\s*\.?\s*(?:Pvt|Private|Pte|Ltd|Limited|LLP|Inc|Corp|Co)\b\.?/gi, ' ')
        .replace(/\s*\.?\s*(?:India|Singapore|Payments?|Services?|Solutions?|Enterprises?|Technologies|Tech)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      parsed.merchant = parsed.merchant.replace(/\.\s+\w{1,4}$/, '').replace(/[.\s]+$/, '').trim();
      if (!parsed.merchant) parsed.merchant = null;
    }
    // Truncate overly long merchant names
    if (parsed.merchant && parsed.merchant.length > 50) {
      parsed.merchant = parsed.merchant.split(/\s+/).slice(0, 3).join(' ');
      warnings.push('merchant_name_truncated');
    }
    // Reject bank names as merchants
    if (parsed.merchant && /^(hdfc|icici|sbi|axis|kotak|yes|idbi)\s*(bank)?$/i.test(parsed.merchant.trim())) {
      warnings.push('bank_name_as_merchant');
      parsed.merchant = null;
    }
  }

  // Compute confidence
  const requiredPresent = schema.required.filter(f => parsed[f] !== undefined && parsed[f] !== null).length;
  const optionalPresent = schema.optional.filter(f => parsed[f] !== undefined && parsed[f] !== null).length;

  let confidence = (requiredPresent / Math.max(schema.required.length, 1)) * 60;
  confidence += (optionalPresent / Math.max(schema.optional.length, 1)) * 30;
  if (warnings.length === 0) confidence += 10;
  confidence -= warnings.length * 5;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  return {
    valid: errors.length === 0,
    confidence,
    errors,
    warnings,
    fieldsPresent,
    fieldsMissing,
  };
}

module.exports = { validateLLMResponse, VALID_FINANCIAL_TYPES, VALID_INSTRUMENT_TYPES };
