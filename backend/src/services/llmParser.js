const Anthropic = require('@anthropic-ai/sdk');
const { createLogger } = require('../utils/logger');
const { validateLLMResponse } = require('../utils/llmResponseValidator');

const logger = createLogger('LLMParser');

// Cache: hash of content → parsed result (avoids re-parsing identical emails)
const parseCache = new Map();
const CACHE_MAX_SIZE = 500;

const PROMPTS = {
  transaction_alert: {
    system: `You are a financial email parser specializing in Indian bank/payment alert emails. Return ONLY valid JSON, no markdown.

CRITICAL RULES:
- "merchant" must be a short, clean merchant/payee name (e.g., "Amazon", "Swiggy", "Zomato", "Flipkart", "HDFC Life Insurance").
  - NEVER use email CTA text like "Know More", "Click Here", "View Details", "Pay Now" as merchant names.
  - NEVER use full product names or order descriptions as merchant names. Extract just the store/company name.
  - NEVER use the full email subject line as the merchant. Extract just the payee/merchant.
  - If the email is about a credit card payment, the merchant is where the money was spent, NOT the bank.
- "date" must be the actual transaction date, NOT copyright dates, promotional dates, or email footer dates. Look for dates near keywords like "on", "dated", "txn date".
- "transaction_type": Use "debit" for money going OUT (purchases, payments, transfers sent, EMIs, bills paid). Use "credit" for money coming IN (salary, refunds, cashback, deposits, transfers received). Note: "credit card" in the text does NOT mean credit — credit card purchases are DEBITS.
- "amount" must be a positive number in INR (no sign).`,
    template: (content, context) => `Parse this transaction alert email and extract the following fields as JSON:
{
  "amount": <number, positive value in INR>,
  "date": "<YYYY-MM-DD>",
  "merchant": "<short clean merchant name, 1-4 words max>",
  "account_last4": "<last 4 digits of account/card>",
  "transaction_type": "<debit|credit>",
  "payment_method": "<UPI|NEFT|IMPS|RTGS|Card|ATM|NetBanking|AutoDebit|Other>",
  "balance_after": <number or null>,
  "account_type": "<savings|current|credit_card>"
}

Sender: ${context.sender || 'unknown'}
Subject: ${context.subject || 'unknown'}

Email content:
${content.substring(0, 3000)}`,
  },

  bank_statement_pdf: {
    system: 'You are a financial document parser. Extract structured data from Indian bank statement text. Return ONLY valid JSON, no markdown.',
    template: (content, context) => `Parse this bank statement text and extract:
{
  "accountLast4": "<last 4 digits>",
  "institutionName": "<bank name>",
  "statementPeriod": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "closingBalance": <number or null>,
  "transactions": [
    { "date": "YYYY-MM-DD", "merchant": "<description>", "amount": <negative for debit, positive for credit>, "transaction_type": "<debit|credit>", "balance_after": <number or null> }
  ]
}

Statement text (first 4000 chars):
${content.substring(0, 4000)}`,
  },

  cc_statement_pdf: {
    system: 'You are a financial document parser. Extract structured data from Indian credit card statement text. Return ONLY valid JSON, no markdown.',
    template: (content, context) => `Parse this credit card statement text and extract:
{
  "cardLast4": "<last 4 digits>",
  "totalDue": <number or null>,
  "minimumDue": <number or null>,
  "dueDate": "<YYYY-MM-DD or null>",
  "creditLimit": <number or null>,
  "transactions": [
    { "date": "YYYY-MM-DD", "merchant": "<description>", "amount": <negative for purchases, positive for credits>, "transaction_type": "<debit|credit>" }
  ]
}

Statement text (first 4000 chars):
${content.substring(0, 4000)}`,
  },

  bill_reminder: {
    system: 'You are a financial email parser. Extract bill/payment reminder details from emails. Return ONLY valid JSON, no markdown.',
    template: (content, context) => `Parse this bill reminder email and extract:
{
  "biller_name": "<company/service name>",
  "bill_type": "<electricity|gas|water|mobile|broadband|dth|insurance|subscription|loan_emi|rent|utility|other>",
  "amount": <number in INR or null>,
  "due_date": "<YYYY-MM-DD or null>",
  "account_number": "<account/consumer number or null>",
  "recurrence": "<monthly|quarterly|yearly|null>"
}

Sender: ${context.sender || 'unknown'}
Subject: ${context.subject || 'unknown'}

Email content:
${content.substring(0, 3000)}`,
  },

  excel_statement: {
    system: 'You are a financial document parser. Extract transaction data from spreadsheet rows. Return ONLY valid JSON, no markdown.',
    template: (content, context) => `These are rows from a bank statement Excel/CSV. Parse and extract transactions:
{
  "transactions": [
    { "date": "YYYY-MM-DD", "merchant": "<description>", "amount": <negative for debit, positive for credit>, "transaction_type": "<debit|credit>", "balance_after": <number or null> }
  ]
}

Rows (JSON):
${content.substring(0, 4000)}`,
  },

  classify_sender: {
    system: 'You are a financial email classifier. Determine if an email sender is from a financial institution. Return ONLY valid JSON.',
    template: (content, context) => `Is this email from a financial institution? Classify it:
{
  "is_financial": <true|false>,
  "institution_name": "<name or null>",
  "institution_type": "<bank|credit_card|upi|investment|biller|other|null>",
  "confidence": <0-100>
}

Sender: ${context.sender}
Subject: ${context.subject}
Body preview: ${content.substring(0, 500)}`,
  },
};

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

function contentHash(content) {
  let hash = 0;
  const str = content.substring(0, 2000);
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

async function parseWithLLM(content, contentType, context = {}, syncRunId = null) {
  const log = syncRunId ? logger.withSyncRunId(syncRunId) : logger;
  const promptConfig = PROMPTS[contentType];

  if (!promptConfig) {
    log.error(`Unknown content type: ${contentType}`);
    return { data: null, meta: { parser: 'llm', error: 'unknown_content_type', confidence: 0 } };
  }

  // Check cache
  const cacheKey = `${contentType}:${contentHash(content)}`;
  if (parseCache.has(cacheKey)) {
    log.debug('LLM cache hit', { contentType });
    return parseCache.get(cacheKey);
  }

  const endTimer = log.startTimer();
  let tokensUsed = 0;

  try {
    const anthropic = getClient();
    const userMessage = promptConfig.template(content, context);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: promptConfig.system,
      messages: [{ role: 'user', content: userMessage }],
    });

    const duration_ms = endTimer(`LLM parsed ${contentType}`, { contentType });
    tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    // Extract JSON from response
    const text = response.content[0]?.text || '';
    let parsed;
    try {
      // Try to find JSON in the response (handles markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      log.warn('LLM response JSON parse failed', { contentType, error: parseErr.message });
      return {
        data: null,
        meta: { parser: 'llm', error: 'json_parse_error', confidence: 0, duration_ms, tokens_used: tokensUsed },
      };
    }

    // Validate
    const validation = validateLLMResponse(parsed, contentType);
    if (!validation.valid) {
      log.warn('LLM response validation failed', { contentType, errors: validation.errors });
    }

    const result = {
      data: validation.valid ? parsed : null,
      meta: {
        parser: 'llm',
        duration_ms,
        confidence: validation.confidence,
        tokens_used: tokensUsed,
        fields_extracted: validation.fieldsPresent,
        fields_missing: validation.fieldsMissing,
        warnings: validation.warnings,
      },
    };

    // Cache the result
    if (parseCache.size >= CACHE_MAX_SIZE) {
      const firstKey = parseCache.keys().next().value;
      parseCache.delete(firstKey);
    }
    parseCache.set(cacheKey, result);

    return result;
  } catch (err) {
    const duration_ms = endTimer(`LLM parse failed for ${contentType}`, { error: err.message });
    log.error('LLM parse error', { contentType, error: err.message });
    return {
      data: null,
      meta: { parser: 'llm', error: err.message, confidence: 0, duration_ms, tokens_used: tokensUsed },
    };
  }
}

module.exports = { parseWithLLM, PROMPTS };
