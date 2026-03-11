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
    const now = new Date();
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    if (d > now) {
      warnings.push('future_date_detected');
      // Auto-fix: null out the date so it falls back to email received date
      parsed.date = null;
    }
    if (d < fiveYearsAgo) {
      warnings.push('date_too_old');
      parsed.date = null;
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
      // Try to extract merchant after "towards" if present
      const towardsMatch = parsed.merchant.match(/towards\s+(.+)/i);
      if (towardsMatch) {
        parsed.merchant = towardsMatch[1].trim().replace(/in$/i, '').trim();
      } else {
        warnings.push('merchant_looks_like_subject');
        parsed.merchant = null;
      }
    }
    // Reject merchant names containing 4+ digit numbers (model numbers, order IDs)
    if (parsed.merchant && /\d{4,}/.test(parsed.merchant)) {
      parsed.merchant = parsed.merchant.split(/\s+/).filter(w => !/\d{4,}/.test(w)).join(' ').trim();
      if (!parsed.merchant) parsed.merchant = null;
      warnings.push('merchant_name_had_numbers');
    }
    // Strip company suffixes from LLM-returned merchant names
    if (parsed.merchant) {
      parsed.merchant = parsed.merchant
        .replace(/\s*\.?\s*(?:Pvt|Private|Pte|Ltd|Limited|LLP|Inc|Corp|Co)\b\.?/gi, ' ')
        .replace(/\s*\.?\s*(?:India|Singapore|Payments?|Services?|Solutions?|Enterprises?|Technologies|Tech)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      // Strip truncation artifacts
      parsed.merchant = parsed.merchant.replace(/\.\s+\w{1,4}$/, '').replace(/[.\s]+$/, '').trim();
      if (!parsed.merchant) parsed.merchant = null;
    }
    // Reject merchant names that are too long (product descriptions)
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

module.exports = { validateLLMResponse };
