const GmailService = require('./gmailService');
const { isWhitelistedSender, getSenderInfo, getGmailSearchQuery, getDomainFromEmail } = require('./senderWhitelist');
const { parseTransactionAlert } = require('../parsers/htmlAlertParser');
const { parseBankStatementPDF, parseCreditCardStatementPDF } = require('../parsers/pdfStatementParser');
const { parseBillReminder } = require('../parsers/billReminderParser');
const { parseExcelStatement } = require('../parsers/excelParser');
const { categorizeTransaction } = require('./categorizationEngine');
const { deduplicateTransactions } = require('./deduplicationEngine');
const RawEmail = require('../models/RawEmail');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Bill = require('../models/Bill');
const User = require('../models/User');

class EmailProcessingEngine {
  constructor(userId) {
    this.userId = userId;
    this.stats = { fetched: 0, parsed: 0, failed: 0, skipped: 0 };
  }

  /**
   * Full sync: fetch emails, parse, categorize, deduplicate
   */
  async runFullSync({ sinceDate } = {}) {
    console.log(`[EmailSync] Starting sync for user ${this.userId}`);

    // Initialize Gmail service
    const gmail = await new GmailService(this.userId).init();

    // Build search query
    const query = this.buildSearchQuery(sinceDate);
    console.log(`[EmailSync] Search query: ${query}`);

    // Fetch email list
    const messages = await gmail.listMessages(query);
    console.log(`[EmailSync] Found ${messages.length} messages`);

    // Process each email
    for (const msg of messages) {
      try {
        // Skip already processed
        const exists = await RawEmail.existsByGmailId(msg.id);
        if (exists) {
          this.stats.skipped++;
          continue;
        }

        // Fetch full message
        const fullMessage = await gmail.getMessage(msg.id);
        const parsed = GmailService.parseMessage(fullMessage);

        // Check whitelist
        if (!isWhitelistedSender(parsed.sender)) {
          this.stats.skipped++;
          continue;
        }

        // Classify and store email
        const category = this.classifyEmail(parsed);
        const rawEmail = await RawEmail.create({
          ...parsed,
          user_id: this.userId,
          email_category: category,
        });

        if (!rawEmail) {
          this.stats.skipped++;
          continue;
        }

        // Process based on category
        await this.processEmail(rawEmail, gmail, fullMessage);
        this.stats.fetched++;
      } catch (err) {
        console.error(`[EmailSync] Error processing message ${msg.id}:`, err.message);
        this.stats.failed++;
      }
    }

    // Run deduplication
    console.log('[EmailSync] Running deduplication...');
    await deduplicateTransactions(this.userId);

    // Update last sync time
    await User.updateLastSync(this.userId);

    console.log(`[EmailSync] Sync complete. Stats:`, this.stats);
    return this.stats;
  }

  /**
   * Process initial onboarding scan (last N days)
   */
  async runOnboardingScan(days = 90) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    return this.runFullSync({ sinceDate });
  }

  buildSearchQuery(sinceDate) {
    const searchBase = getGmailSearchQuery();
    if (sinceDate) {
      const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '/');
      return `${searchBase} after:${dateStr}`;
    }
    return searchBase;
  }

  /**
   * Classify email into categories based on sender and content
   */
  classifyEmail(parsed) {
    const senderInfo = getSenderInfo(parsed.sender);
    const subject = (parsed.subject || '').toLowerCase();
    const hasAttachments = parsed.attachments && parsed.attachments.length > 0;

    // Check for statement attachments
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

    // Bill reminders
    if (senderInfo?.type === 'biller' || /bill|due|payment\s+reminder|renew/i.test(subject)) {
      return 'bill_reminder';
    }

    // Transaction alerts
    if (/debit|credit|transaction|spent|received|payment|transfer|UPI/i.test(subject)) {
      return 'transaction_alert';
    }

    // Default based on sender type
    if (senderInfo?.type === 'bank' || senderInfo?.type === 'upi') return 'transaction_alert';
    if (senderInfo?.type === 'credit_card') return 'transaction_alert';
    if (senderInfo?.type === 'investment') return 'investment_statement';

    return 'transaction_alert'; // Default
  }

  /**
   * Process a classified email
   */
  async processEmail(rawEmail, gmail, fullMessage) {
    try {
      switch (rawEmail.email_category) {
        case 'transaction_alert':
          await this.processTransactionAlert(rawEmail);
          break;
        case 'statement_pdf':
        case 'cc_statement_pdf':
          await this.processStatementPDF(rawEmail, gmail, fullMessage);
          break;
        case 'statement_excel':
          await this.processStatementExcel(rawEmail, gmail, fullMessage);
          break;
        case 'bill_reminder':
          await this.processBillReminder(rawEmail);
          break;
        case 'investment_statement':
          await this.processInvestmentStatement(rawEmail, gmail, fullMessage);
          break;
        default:
          await this.processTransactionAlert(rawEmail);
      }

      await RawEmail.markProcessed(rawEmail.id, { status: 'success' });
      this.stats.parsed++;
    } catch (err) {
      console.error(`[EmailProcess] Error processing email ${rawEmail.id}:`, err.message);
      await RawEmail.markProcessed(rawEmail.id, { status: 'failed', errors: err.message });
      this.stats.failed++;
    }
  }

  async processTransactionAlert(rawEmail) {
    const body = rawEmail.body_html || rawEmail.body_text;
    const parsed = parseTransactionAlert(body, rawEmail.sender, rawEmail.subject);
    if (!parsed) return;

    // Categorize
    parsed.category = categorizeTransaction(parsed.merchant);

    // Store raw transaction
    await Transaction.insertRaw({
      ...parsed,
      user_id: this.userId,
      email_id: rawEmail.id,
    });

    // Upsert account
    const senderInfo = getSenderInfo(rawEmail.sender);
    if (parsed.account_last4) {
      await Account.upsert({
        userId: this.userId,
        institutionName: senderInfo?.name || getDomainFromEmail(rawEmail.sender),
        accountType: parsed.account_type || 'savings',
        accountLast4: parsed.account_last4,
        balance: parsed.balance_after,
      });
    }
  }

  async processStatementPDF(rawEmail, gmail, fullMessage) {
    if (!rawEmail.attachments || rawEmail.attachments.length === 0) return;

    for (const attachment of JSON.parse(rawEmail.attachments)) {
      if (!attachment.filename?.endsWith('.pdf')) continue;

      // Download attachment
      const pdfBuffer = await gmail.getAttachment(rawEmail.gmail_message_id, attachment.attachmentId);

      // Parse based on type
      const isCC = rawEmail.email_category === 'cc_statement_pdf';
      const result = isCC
        ? await parseCreditCardStatementPDF(pdfBuffer)
        : await parseBankStatementPDF(pdfBuffer);

      // Store transactions
      for (const txn of result.transactions) {
        txn.category = categorizeTransaction(txn.merchant);
        await Transaction.insertRaw({
          ...txn,
          user_id: this.userId,
          email_id: rawEmail.id,
        });
      }

      // Update account with statement data
      const accountLast4 = isCC ? result.cardLast4 : result.accountLast4;
      if (accountLast4) {
        const senderInfo = getSenderInfo(rawEmail.sender);
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
  }

  async processStatementExcel(rawEmail, gmail, fullMessage) {
    if (!rawEmail.attachments || rawEmail.attachments.length === 0) return;

    for (const attachment of JSON.parse(rawEmail.attachments)) {
      if (!attachment.filename?.match(/\.(xlsx?|csv)$/i)) continue;

      const buffer = await gmail.getAttachment(rawEmail.gmail_message_id, attachment.attachmentId);
      const result = await parseExcelStatement(buffer);

      for (const txn of result.transactions) {
        txn.category = categorizeTransaction(txn.merchant);
        await Transaction.insertRaw({
          ...txn,
          user_id: this.userId,
          email_id: rawEmail.id,
        });
      }
    }
  }

  async processBillReminder(rawEmail) {
    const body = rawEmail.body_html || rawEmail.body_text;
    const parsed = parseBillReminder(body, rawEmail.sender, rawEmail.subject);
    if (!parsed) return;

    await Bill.create({
      ...parsed,
      user_id: this.userId,
      reminder_email_id: rawEmail.id,
    });
  }

  async processInvestmentStatement(rawEmail, gmail, fullMessage) {
    // Placeholder for MF CAS and demat statement parsing
    // For now, store the raw email for future processing
    console.log(`[EmailProcess] Investment statement stored for manual review: ${rawEmail.id}`);
  }
}

module.exports = EmailProcessingEngine;
