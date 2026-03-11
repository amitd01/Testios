const { validateAmount, validateDate, validateAccountLast4 } = require('./validators');

const SCHEMAS = {
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
  const allFields = [...schema.required, ...schema.optional];

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

  // Reject hallucinated data
  if (parsed.amount && typeof parsed.amount === 'number' && Math.abs(parsed.amount) > 10000000) {
    warnings.push('amount_suspiciously_large');
  }
  if (parsed.date) {
    const d = new Date(parsed.date);
    if (d > new Date()) warnings.push('future_date_detected');
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

module.exports = { validateLLMResponse };
