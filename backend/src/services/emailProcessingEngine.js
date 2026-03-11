const GmailService = require('./gmailService');
const { isWhitelistedSender, getSenderInfo, getGmailSearchQuery, getDomainFromEmail, recordPendingSender } = require('./senderService');
const { parseTransactionAlert } = require('../parsers/htmlAlertParser');
const { parseBankStatementPDF, parseCreditCardStatementPDF } = require('../parsers/pdfStatementParser');
const { parseBillReminder } = require('../parsers/billReminderParser');
const { parseExcelStatement } = require('../parsers/excelParser');
const { categorizeTransaction } = require('./categorizationEngine');
const { deduplicateTransactions } = require('./deduplicationEngine');
const { parseWithLLM, clearCache: clearLLMCache } = require('./llmParser');
const { recordSuccess, recordFailure } = require('./templateRegistry');
const { createLogger } = require('../utils/logger');
const db = require('../config/database');
const SyncRun = require('../models/SyncRun');
const RawEmail = require('../models/RawEmail');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Bill = require('../models/Bill');
const User = require('../models/User');

const LLM_CONFIDENCE_THRESHOLD = 50;

/**
 * Extract merchant name from email subject as a fallback
 * e.g. "Your Hdfc Bank Credit Card Ending 4141 Towards Amazonin" → "Amazon"
 */
function extractMerchantFromSubject(subject) {
  if (!subject) return null;

  function cleanSubjectMerchant(raw) {
    if (!raw) return null;
    let m = raw.trim();
    // Strip company suffixes and truncated forms
    m = m
      .replace(/\s*\.?\s*(?:Pvt|Private|Pte|Ltd|Limited|LLP|Inc|Corp|Co)\b\.?/gi, ' ')
      .replace(/\s*\.?\s*(?:India|Singapore|Payments?|Services?|Solutions?|Enterprises?|Technologies|Tech)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Strip trailing "in" from "Amazonin" (only when no space before "in")
    m = m.replace(/([a-z])in$/i, '$1');
    // Remove truncation artifacts: "Priva", "Limite", ". The", ". Si", etc.
    m = m.replace(/\s+(?:Priva|Limite|Technolog|Singa|Servi)\w*$/i, '').trim();
    m = m.replace(/\.\s+\w{1,4}$/, '').trim();
    m = m.replace(/[.\s]+$/, '').trim();
    if (m.length > 1 && m.length < 40 && !/\d{4,}/.test(m)) return m;
    return null;
  }

  // "towards <merchant>" pattern (HDFC style)
  const towardsMatch = subject.match(/towards\s+(.+?)(?:\s+on\s+\d|\s+for\s+Rs|\s+was|\s+Amount|$)/i);
  if (towardsMatch) {
    const merchant = cleanSubjectMerchant(towardsMatch[1]);
    if (merchant) return merchant;
  }

  // "at <merchant>" pattern
  const atMatch = subject.match(/(?:spent|paid|purchase[d]?|transacted|used|debited)\s+(?:at|on|for)\s+([A-Za-z][A-Za-z0-9\s&.'-]+?)(?:\s+on\s+\d|\s+for\s+Rs|\s+Amount|$)/i);
  if (atMatch) {
    const merchant = cleanSubjectMerchant(atMatch[1]);
    if (merchant) return merchant;
  }

  // "to <merchant>" pattern (ICICI, SBI style: "Rs 500 debited to Swiggy")
  const toMatch = subject.match(/(?:debited|credited|paid|sent|transferred)\s+(?:to|from|by)\s+([A-Za-z][A-Za-z0-9\s&.'-]+?)(?:\s+on\s+\d|\s+for\s+Rs|\s+Amount|$)/i);
  if (toMatch) {
    const merchant = cleanSubjectMerchant(toMatch[1]);
    if (merchant) return merchant;
  }

  return null;
}

class EmailProcessingEngine {
  constructor(userId) {
    this.userId = userId;
    this.stats = { fetched: 0, parsed: 0, failed: 0, skipped: 0, transactions: 0 };
    this.syncRunId = null;
    this.logger = createLogger('EmailSync');
    this.errorCounts = {};
    this.gmailApiCalls = 0;
    this.gmailApiTime = 0;
    this.parseTime = 0;
    this.dbTime = 0;
    this.llmCalls = 0;
    this.llmTokensTotal = 0;
    this.attachmentsProcessed = 0;
  }

  /**
   * Full sync: fetch emails, parse, categorize, deduplicate
   * Now fully instrumented with sync run tracking
   */
  async runFullSync({ sinceDate } = {}) {
    // Build search query (async — reads from DB)
    const query = await this.buildSearchQuery(sinceDate);

    // Create sync run record
    const syncRun = await SyncRun.create(this.userId, sinceDate ? 'incremental' : 'full', {
      searchQuery: query,
      sinceDate,
    });
    this.syncRunId = syncRun.id;
    this.logger = this.logger.withSyncRunId(syncRun.id);

    this.logger.info('Starting sync', { run_type: syncRun.run_type, since_date: sinceDate?.toISOString() });

    try {
      // Initialize Gmail service
      const gmail = await new GmailService(this.userId).init();

      // Fetch email list
      const listResult = await gmail.listMessages(query);
      const messages = listResult.messages;
      this.gmailApiCalls += listResult.timing.api_calls;
      this.gmailApiTime += listResult.timing.duration_ms;

      this.logger.info(`Found ${messages.length} messages`, { count: messages.length });
      await SyncRun.incrementCounters(this.syncRunId, { emails_found: messages.length });

      // Process each email
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        try {
          await this.processMessage(msg, gmail);
        } catch (err) {
          this.logger.error(`Error processing message ${msg.id}`, { error: err.message, gmail_id: msg.id });
          this.recordError('unknown');
          this.stats.failed++;
        }

        // Batch update counters every 10 emails
        if ((i + 1) % 10 === 0) {
          await this.flushCounters();
        }
      }

      // Run deduplication
      this.logger.info('Running deduplication...');
      const dedupResult = await deduplicateTransactions(this.userId);
      this.logger.info('Deduplication complete', dedupResult.stats);

      // Update last sync time
      await User.updateLastSync(this.userId);

      // Finalize sync run
      await this.flushCounters();
      await SyncRun.incrementCounters(this.syncRunId, {
        transactions_deduplicated: dedupResult.stats.output,
        gmail_api_calls: this.gmailApiCalls,
        gmail_api_time_ms: this.gmailApiTime,
        parse_time_ms: this.parseTime,
        llm_calls: this.llmCalls,
        llm_tokens_total: this.llmTokensTotal,
        attachments_processed: this.attachmentsProcessed,
      });
      await SyncRun.complete(this.syncRunId, 'completed', this.errorCounts);

      this.logger.info('Sync complete', { stats: this.stats, dedup: dedupResult.stats });
      return this.stats;
    } catch (err) {
      this.logger.error('Sync failed', { error: err.message });
      await SyncRun.complete(this.syncRunId, 'failed', { fatal: err.message, ...this.errorCounts });
      throw err;
    }
  }

  /**
   * Process initial onboarding scan (last N days)
   */
  async runOnboardingScan(days = 30) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    return this.runFullSync({ sinceDate });
  }

  async buildSearchQuery(sinceDate) {
    const searchBase = await getGmailSearchQuery();
    if (sinceDate) {
      const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '/');
      return `${searchBase} after:${dateStr}`;
    }
    return searchBase;
  }

  /**
   * Process a single Gmail message
   */
  async processMessage(msg, gmail) {
    // Skip already processed
    const exists = await RawEmail.existsByGmailId(msg.id);
    if (exists) {
      this.stats.skipped++;
      return;
    }

    // Fetch full message (with timing)
    const msgResult = await gmail.getMessage(msg.id);
    const fullMessage = msgResult.data;
    this.gmailApiCalls++;
    this.gmailApiTime += msgResult.timing.duration_ms;

    const parsed = GmailService.parseMessage(fullMessage);
    const domain = getDomainFromEmail(parsed.sender);

    // Check whitelist
    const whitelisted = await isWhitelistedSender(parsed.sender);
    if (!whitelisted) {
      // Record potential new sender if it looks financial
      if (/debit|credit|transaction|statement|bill|payment|balance/i.test(parsed.subject || '')) {
        await recordPendingSender(domain, parsed.sender, parsed.subject);
        this.logger.info('Potential new financial sender detected', { domain, subject: parsed.subject });
      }
      this.stats.skipped++;
      return;
    }

    // Classify and store email
    const senderInfo = await getSenderInfo(parsed.sender);
    const category = this.classifyEmail(parsed, senderInfo);
    const rawEmail = await RawEmail.create({
      ...parsed,
      user_id: this.userId,
      email_category: category,
      sync_run_id: this.syncRunId,
    });

    if (!rawEmail) {
      this.stats.skipped++;
      return;
    }

    // Process based on category with per-email timing
    const emailStartTime = Date.now();
    await this.processEmail(rawEmail, gmail, fullMessage, senderInfo);
    this.stats.fetched++;
  }

  /**
   * Classify email into categories based on sender and content
   */
  classifyEmail(parsed, senderInfo) {
    const subject = (parsed.subject || '').toLowerCase();
    const hasAttachments = parsed.attachments && parsed.attachments.length > 0;

    if (hasAttachments) {
      const hasPdf = parsed.attachments.some(a =>
        a.mimeType === 'application/pdf' || a.filename?.endsWith('.pdf')
      );
      const hasExcel = parsed.attachments.some(a =>
        a.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        a.mimeType === 'application/vnd.ms-excel' ||
        a.filename?.endsWith('.xlsx') || a.filename?.endsWith('.xls')
      );

      if (hasPdf && /statement|cas|consolidated/i.test(subject)) {
        if (senderInfo?.type === 'investment') return 'investment_statement';
        if (senderInfo?.type === 'credit_card') return 'cc_statement_pdf';
        return 'statement_pdf';
      }
      if (hasExcel && /statement/i.test(subject)) return 'statement_excel';
    }

    if (senderInfo?.type === 'biller' || /bill|due|payment\s+reminder|renew/i.test(subject)) {
      return 'bill_reminder';
    }

    if (/debit|credit|transaction|spent|received|payment|transfer|UPI/i.test(subject)) {
      return 'transaction_alert';
    }

    if (senderInfo?.type === 'bank' || senderInfo?.type === 'upi') return 'transaction_alert';
    if (senderInfo?.type === 'credit_card') return 'transaction_alert';
    if (senderInfo?.type === 'investment') return 'investment_statement';

    return 'transaction_alert';
  }

  /**
   * Process a classified email with full instrumentation
   */
  async processEmail(rawEmail, gmail, fullMessage, senderInfo) {
    const emailStartTime = Date.now();
    let parserUsed = null;
    let llmUsed = false;
    let llmTokens = 0;
    let confidence = 0;
    let errorType = null;
    let txnCount = 0;
    let processingDetails = {};

    try {
      const result = await this.dispatchProcessing(rawEmail, gmail, fullMessage, senderInfo);
      parserUsed = result.parserUsed;
      llmUsed = result.llmUsed;
      llmTokens = result.llmTokens || 0;
      confidence = result.confidence;
      txnCount = result.txnCount;
      processingDetails = result.details || {};

      if (llmUsed) {
        this.llmCalls++;
        this.llmTokensTotal += llmTokens;
      }

      await RawEmail.markProcessed(rawEmail.id, { status: 'success' });
      this.stats.parsed++;
      this.stats.transactions += txnCount;

      // Record template success
      const domain = getDomainFromEmail(rawEmail.sender);
      if (domain) {
        await recordSuccess(domain, rawEmail.email_category, rawEmail.body_html, rawEmail.id);
      }
    } catch (err) {
      errorType = this.classifyError(err);
      this.logger.error(`Processing failed for ${rawEmail.id}`, { error: err.message, error_type: errorType, category: rawEmail.email_category });
      await RawEmail.markProcessed(rawEmail.id, { status: 'failed', errors: err.message });
      this.recordError(errorType);
      this.stats.failed++;

      // Record template failure
      const domain = getDomainFromEmail(rawEmail.sender);
      if (domain) {
        await recordFailure(domain, rawEmail.email_category, rawEmail.body_html);
      }
    }

    const processingTime = Date.now() - emailStartTime;
    this.parseTime += processingTime;

    // Update raw_email with observability data
    await RawEmail.updateObservability(rawEmail.id, {
      processing_time_ms: processingTime,
      parser_used: parserUsed,
      llm_used: llmUsed,
      llm_tokens_used: llmTokens,
      confidence_score: confidence,
      error_type: errorType,
      transactions_extracted: txnCount,
      processing_details: processingDetails,
    });
  }

  /**
   * Dispatch to the correct parser with LLM fallback
   */
  async dispatchProcessing(rawEmail, gmail, fullMessage, senderInfo) {
    switch (rawEmail.email_category) {
      case 'transaction_alert':
        return this.processTransactionAlert(rawEmail, senderInfo);
      case 'statement_pdf':
      case 'cc_statement_pdf':
        return this.processStatementPDF(rawEmail, gmail, fullMessage, senderInfo);
      case 'statement_excel':
        return this.processStatementExcel(rawEmail, gmail, fullMessage);
      case 'bill_reminder':
        return this.processBillReminder(rawEmail, senderInfo);
      case 'investment_statement':
        return this.processInvestmentStatement(rawEmail, gmail, fullMessage);
      default:
        return this.processTransactionAlert(rawEmail, senderInfo);
    }
  }

  async processTransactionAlert(rawEmail, senderInfo) {
    const body = rawEmail.body_html || rawEmail.body_text;

    // 1. Try regex parser
    const regexResult = parseTransactionAlert(body, rawEmail.sender, rawEmail.subject, senderInfo);
    let useResult = regexResult;
    let llmUsed = false;
    let llmTokens = 0;

    // 2. If regex fails, low confidence, or missing merchant — try LLM
    const regexMissingMerchant = regexResult.data && (!regexResult.data.merchant || regexResult.data.merchant === 'Unknown');
    if (!regexResult.data || regexResult.meta.confidence < LLM_CONFIDENCE_THRESHOLD || regexMissingMerchant) {
      try {
        const llmResult = await parseWithLLM(body, 'transaction_alert', {
          sender: rawEmail.sender,
          subject: rawEmail.subject,
        }, this.syncRunId);

        llmUsed = true;
        llmTokens = llmResult.meta.tokens_used || 0;

        if (llmResult.data) {
          const llmData = llmResult.data;

          if (regexMissingMerchant && regexResult.data && llmData.merchant) {
            // Merge: keep regex data (amount, account, balance) but take LLM merchant & date
            useResult = {
              data: {
                ...regexResult.data,
                merchant: llmData.merchant || regexResult.data.merchant,
                date: llmData.date || regexResult.data.date,
                metadata: { ...regexResult.data.metadata, parsed_by: 'hybrid' },
              },
              meta: { ...regexResult.meta, parser: 'hybrid', llm_confidence: llmResult.meta.confidence },
            };
          } else if (llmResult.meta.confidence > (regexResult.meta?.confidence || 0)) {
            // Full LLM replacement — LLM was better overall
            useResult = {
              data: {
                amount: llmData.transaction_type === 'debit' ? -Math.abs(llmData.amount) : Math.abs(llmData.amount),
                date: llmData.date || new Date().toISOString().split('T')[0],
                merchant: llmData.merchant || 'Unknown',
                account_last4: llmData.account_last4 || null,
                account_type: llmData.account_type || 'savings',
                transaction_type: llmData.transaction_type || 'debit',
                payment_method: llmData.payment_method || 'Other',
                balance_after: llmData.balance_after || null,
                source: 'email_alert',
                metadata: { sender: rawEmail.sender, institution: senderInfo?.name, parsed_by: 'llm' },
              },
              meta: { ...llmResult.meta, parser: 'llm' },
            };
          }
        }
      } catch (err) {
        this.logger.warn('LLM fallback failed', { error: err.message, email_id: rawEmail.id });
      }
    }

    if (!useResult.data) {
      return { parserUsed: useResult.meta?.parser || 'htmlAlertParser', llmUsed, llmTokens, confidence: 0, txnCount: 0, details: useResult.meta };
    }

    const parsed = useResult.data;

    // Date resolution for transaction alerts:
    // For alert emails, the email received date IS the transaction date (banks send alerts immediately).
    // Use parsed body date only if it's a valid recent past date; otherwise prefer received_at.
    const emailDate = rawEmail.received_at || rawEmail.created_at;
    const emailDateStr = emailDate ? new Date(emailDate).toISOString().split('T')[0] : null;
    const todayStr = new Date().toISOString().split('T')[0];

    if (!parsed.date || parsed.date === 'null' || parsed.date === todayStr) {
      // If parsed date is missing or is today (likely a false match from footer), use email date
      parsed.date = emailDateStr || todayStr;
    }

    // Validate date is not in the future or too old
    const parsedDate = new Date(parsed.date);
    const now = new Date();
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    if (parsedDate > now || parsedDate < fiveYearsAgo) {
      parsed.date = emailDateStr || todayStr;
    }

    // Clean up merchant name — use subject-derived merchant as fallback
    if (!parsed.merchant || parsed.merchant === 'Unknown') {
      const subjectMerchant = extractMerchantFromSubject(rawEmail.subject);
      if (subjectMerchant) parsed.merchant = subjectMerchant;
    }

    // Final merchant cleanup: strip bank/card preamble that leaked through
    if (parsed.merchant && /\b(credit card|debit card|ending\s+\d{4})\b/i.test(parsed.merchant)) {
      const towards = parsed.merchant.match(/towards\s+(.+)/i);
      if (towards) {
        parsed.merchant = towards[1].trim().replace(/in$/i, '').trim();
      } else {
        parsed.merchant = 'Unknown';
      }
    }

    // Title-case the merchant name
    if (parsed.merchant && parsed.merchant !== 'Unknown') {
      parsed.merchant = parsed.merchant
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }

    parsed.category = categorizeTransaction(parsed.merchant);

    await Transaction.insertRaw({
      ...parsed,
      user_id: this.userId,
      email_id: rawEmail.id,
    });

    if (parsed.account_last4) {
      await Account.upsert({
        userId: this.userId,
        institutionName: senderInfo?.name || getDomainFromEmail(rawEmail.sender),
        accountType: parsed.account_type || 'savings',
        accountLast4: parsed.account_last4,
        balance: parsed.balance_after,
      });
    }

    return {
      parserUsed: useResult.meta?.parser || 'htmlAlertParser',
      llmUsed,
      llmTokens,
      confidence: useResult.meta?.confidence || 0,
      txnCount: 1,
      details: useResult.meta,
    };
  }

  async processStatementPDF(rawEmail, gmail, fullMessage, senderInfo) {
    if (!rawEmail.attachments || rawEmail.attachments.length === 0) {
      return { parserUsed: 'pdfStatementParser', llmUsed: false, llmTokens: 0, confidence: 0, txnCount: 0 };
    }

    let totalTxns = 0;
    let bestConfidence = 0;
    let parserUsed = 'pdfStatementParser';
    let llmUsed = false;
    let llmTokens = 0;
    const attachments = typeof rawEmail.attachments === 'string' ? JSON.parse(rawEmail.attachments) : rawEmail.attachments;

    for (const attachment of attachments) {
      if (!attachment.filename?.endsWith('.pdf')) continue;

      const attachResult = await gmail.getAttachment(rawEmail.gmail_message_id, attachment.attachmentId);
      this.gmailApiCalls++;
      this.gmailApiTime += attachResult.timing.duration_ms;
      this.attachmentsProcessed++;

      const isCC = rawEmail.email_category === 'cc_statement_pdf';
      const regexResult = isCC
        ? await parseCreditCardStatementPDF(attachResult.buffer)
        : await parseBankStatementPDF(attachResult.buffer);

      let useResult = regexResult;

      // LLM fallback for PDF if regex found no transactions
      if (!regexResult.data || regexResult.meta.confidence < LLM_CONFIDENCE_THRESHOLD) {
        if (regexResult.meta?.error === 'pdf_encrypted' || regexResult.meta?.error === 'pdf_scanned') {
          // Can't do much with encrypted/scanned PDFs even with LLM
          parserUsed = regexResult.meta.parser;
          bestConfidence = 0;
        } else {
          // Try LLM with the extracted text
          try {
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(attachResult.buffer);
            const llmResult = await parseWithLLM(
              pdfData.text,
              isCC ? 'cc_statement_pdf' : 'bank_statement_pdf',
              { sender: rawEmail.sender },
              this.syncRunId
            );
            llmUsed = true;
            llmTokens += llmResult.meta.tokens_used || 0;

            if (llmResult.data && llmResult.meta.confidence > (regexResult.meta?.confidence || 0)) {
              useResult = llmResult;
              parserUsed = 'llm';
            }
          } catch (err) {
            this.logger.warn('LLM PDF fallback failed', { error: err.message });
          }
        }
      }

      if (!useResult.data) continue;

      const result = useResult.data;
      bestConfidence = Math.max(bestConfidence, useResult.meta?.confidence || 0);

      // Store transactions
      const txns = result.transactions || [];
      for (const txn of txns) {
        txn.category = categorizeTransaction(txn.merchant);
        await Transaction.insertRaw({
          ...txn,
          user_id: this.userId,
          email_id: rawEmail.id,
        });
      }
      totalTxns += txns.length;

      // Update account
      const accountLast4 = isCC ? result.cardLast4 : result.accountLast4;
      if (accountLast4) {
        await Account.upsert({
          userId: this.userId,
          institutionName: result.institutionName || senderInfo?.name || 'Unknown',
          accountType: isCC ? 'credit_card' : 'savings',
          accountLast4,
          balance: isCC ? result.totalDue : result.closingBalance,
          creditLimit: isCC ? result.creditLimit : null,
          statementDate: result.statementPeriod?.to || new Date().toISOString().split('T')[0],
          statementEmailId: rawEmail.id,
        });
      }
    }

    return { parserUsed, llmUsed, llmTokens, confidence: bestConfidence, txnCount: totalTxns };
  }

  async processStatementExcel(rawEmail, gmail, fullMessage) {
    if (!rawEmail.attachments || rawEmail.attachments.length === 0) {
      return { parserUsed: 'excelParser', llmUsed: false, llmTokens: 0, confidence: 0, txnCount: 0 };
    }

    let totalTxns = 0;
    let bestConfidence = 0;
    const attachments = typeof rawEmail.attachments === 'string' ? JSON.parse(rawEmail.attachments) : rawEmail.attachments;

    for (const attachment of attachments) {
      if (!attachment.filename?.match(/\.(xlsx?|csv)$/i)) continue;

      const attachResult = await gmail.getAttachment(rawEmail.gmail_message_id, attachment.attachmentId);
      this.gmailApiCalls++;
      this.gmailApiTime += attachResult.timing.duration_ms;
      this.attachmentsProcessed++;

      const result = await parseExcelStatement(attachResult.buffer);
      bestConfidence = Math.max(bestConfidence, result.meta?.confidence || 0);

      const txns = result.data?.transactions || [];
      for (const txn of txns) {
        txn.category = categorizeTransaction(txn.merchant);
        await Transaction.insertRaw({
          ...txn,
          user_id: this.userId,
          email_id: rawEmail.id,
        });
      }
      totalTxns += txns.length;
    }

    return { parserUsed: 'excelParser', llmUsed: false, llmTokens: 0, confidence: bestConfidence, txnCount: totalTxns };
  }

  async processBillReminder(rawEmail, senderInfo) {
    const body = rawEmail.body_html || rawEmail.body_text;

    // Regex first
    const regexResult = parseBillReminder(body, rawEmail.sender, rawEmail.subject, senderInfo);
    let useResult = regexResult;
    let llmUsed = false;
    let llmTokens = 0;

    // LLM fallback
    if (!regexResult.data || regexResult.meta.confidence < LLM_CONFIDENCE_THRESHOLD) {
      try {
        const llmResult = await parseWithLLM(body, 'bill_reminder', {
          sender: rawEmail.sender,
          subject: rawEmail.subject,
        }, this.syncRunId);

        llmUsed = true;
        llmTokens = llmResult.meta.tokens_used || 0;

        if (llmResult.data && llmResult.meta.confidence > (regexResult.meta?.confidence || 0)) {
          useResult = {
            data: {
              ...llmResult.data,
              source: 'bill_reminder',
              metadata: { sender: rawEmail.sender },
            },
            meta: { ...llmResult.meta, parser: 'llm' },
          };
        }
      } catch (err) {
        this.logger.warn('LLM bill reminder fallback failed', { error: err.message });
      }
    }

    if (!useResult.data) {
      return { parserUsed: useResult.meta?.parser || 'billReminderParser', llmUsed, llmTokens, confidence: 0, txnCount: 0, details: useResult.meta };
    }

    await Bill.create({
      ...useResult.data,
      user_id: this.userId,
      reminder_email_id: rawEmail.id,
    });

    return {
      parserUsed: useResult.meta?.parser || 'billReminderParser',
      llmUsed,
      llmTokens,
      confidence: useResult.meta?.confidence || 0,
      txnCount: 0,
      details: useResult.meta,
    };
  }

  async processInvestmentStatement(rawEmail, gmail, fullMessage) {
    this.logger.info('Investment statement stored for manual review', { email_id: rawEmail.id });
    return { parserUsed: 'none', llmUsed: false, llmTokens: 0, confidence: 0, txnCount: 0 };
  }

  /**
   * Re-parse all stored emails with updated parsing logic.
   * Clears existing parsed data, resets raw_emails to pending, re-processes each.
   * Does NOT re-fetch from Gmail — uses stored email content.
   */
  async runReparse() {
    const syncRun = await SyncRun.create(this.userId, 'reparse', { reason: 'manual_reparse' });
    this.syncRunId = syncRun.id;
    this.logger = this.logger.withSyncRunId(syncRun.id);
    this.logger.info('Starting re-parse of all stored emails');

    // Clear LLM cache so re-parse uses fresh results with updated prompts
    clearLLMCache();

    try {
      // 1. Clear existing parsed data (transactions, raw_transactions, bills) for this user
      await db.query('DELETE FROM transactions WHERE user_id = $1', [this.userId]);
      await db.query('DELETE FROM raw_transactions WHERE user_id = $1', [this.userId]);
      await db.query('DELETE FROM bills WHERE user_id = $1', [this.userId]);
      this.logger.info('Cleared existing parsed data');

      // 2. Reset all raw_emails to pending
      await db.query(
        `UPDATE raw_emails SET parsing_status = 'pending', processed_at = NULL,
         parsing_errors = NULL, processing_time_ms = NULL, parser_used = NULL,
         llm_used = NULL, llm_tokens_used = NULL, confidence_score = NULL,
         error_type = NULL, transactions_extracted = NULL, processing_details = NULL
         WHERE user_id = $1`,
        [this.userId]
      );

      // 3. Get all stored emails
      const result = await db.query(
        'SELECT * FROM raw_emails WHERE user_id = $1 ORDER BY received_at ASC',
        [this.userId]
      );
      const emails = result.rows;
      this.logger.info(`Re-parsing ${emails.length} stored emails`);
      await SyncRun.incrementCounters(this.syncRunId, { emails_found: emails.length });

      // 4. Re-process each email (only types that don't need attachments)
      for (let i = 0; i < emails.length; i++) {
        const rawEmail = emails[i];
        try {
          const senderInfo = await getSenderInfo(rawEmail.sender);

          // Re-classify in case classification logic also improved
          const parsed = {
            subject: rawEmail.subject,
            sender: rawEmail.sender,
            attachments: typeof rawEmail.attachments === 'string'
              ? JSON.parse(rawEmail.attachments) : rawEmail.attachments,
          };
          const category = this.classifyEmail(parsed, senderInfo);

          // Update category if changed
          if (category !== rawEmail.email_category) {
            await db.query('UPDATE raw_emails SET email_category = $1 WHERE id = $2', [category, rawEmail.id]);
            rawEmail.email_category = category;
          }

          // Only re-parse types that have stored body content
          if (rawEmail.email_category === 'transaction_alert' || rawEmail.email_category === 'bill_reminder') {
            await this.processEmail(rawEmail, null, null, senderInfo);
          } else {
            // PDF/Excel need re-download — skip and mark as needing re-sync
            await RawEmail.markProcessed(rawEmail.id, { status: 'pending', errors: 'needs_attachment_redownload' });
            this.stats.skipped++;
          }
        } catch (err) {
          this.logger.error(`Re-parse failed for email ${rawEmail.id}`, { error: err.message });
          await RawEmail.markProcessed(rawEmail.id, { status: 'failed', errors: err.message });
          this.recordError(this.classifyError(err));
          this.stats.failed++;
        }

        if ((i + 1) % 10 === 0) {
          await this.flushCounters();
        }
      }

      // 5. Run deduplication
      this.logger.info('Running deduplication...');
      const dedupResult = await deduplicateTransactions(this.userId);
      this.logger.info('Deduplication complete', dedupResult.stats);

      // 6. Finalize
      await this.flushCounters();
      await SyncRun.incrementCounters(this.syncRunId, {
        transactions_deduplicated: dedupResult.stats.output,
        llm_calls: this.llmCalls,
        llm_tokens_total: this.llmTokensTotal,
        parse_time_ms: this.parseTime,
      });
      await SyncRun.complete(this.syncRunId, 'completed', this.errorCounts);

      this.logger.info('Re-parse complete', { stats: this.stats, dedup: dedupResult.stats });
      return this.stats;
    } catch (err) {
      this.logger.error('Re-parse failed', { error: err.message });
      await SyncRun.complete(this.syncRunId, 'failed', { fatal: err.message, ...this.errorCounts });
      throw err;
    }
  }

  // --- Helpers ---

  classifyError(err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('token') || msg.includes('auth') || msg.includes('401')) return 'auth_error';
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) return 'timeout';
    if (msg.includes('rate limit') || msg.includes('429')) return 'api_error';
    if (msg.includes('password') || msg.includes('encrypted')) return 'pdf_encrypted';
    if (msg.includes('scanned') || msg.includes('image')) return 'pdf_scanned';
    if (msg.includes('parse') || msg.includes('regex')) return 'parser_error';
    if (msg.includes('amount')) return 'no_amount';
    if (msg.includes('date')) return 'invalid_date';
    if (msg.includes('attachment')) return 'attachment_error';
    return 'unknown';
  }

  recordError(type) {
    this.errorCounts[type] = (this.errorCounts[type] || 0) + 1;
  }

  async flushCounters() {
    try {
      await SyncRun.incrementCounters(this.syncRunId, {
        emails_processed: this.stats.fetched + this.stats.failed,
        emails_parsed: this.stats.parsed,
        emails_failed: this.stats.failed,
        emails_skipped: this.stats.skipped,
        transactions_extracted: this.stats.transactions,
      });
    } catch (err) {
      this.logger.warn('Failed to flush counters', { error: err.message });
    }
  }
}

module.exports = EmailProcessingEngine;
