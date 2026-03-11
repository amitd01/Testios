const SyncRun = require('../models/SyncRun');
const RawEmail = require('../models/RawEmail');

const diagnosticsController = {
  /**
   * GET /api/diagnostics/sync-runs - List sync runs
   */
  async listSyncRuns(req, res) {
    try {
      const { limit = 20, offset = 0 } = req.query;
      const runs = await SyncRun.getByUser(req.userId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch sync runs: ' + err.message });
    }
  },

  /**
   * GET /api/diagnostics/sync-runs/:id - Full run detail
   */
  async getSyncRun(req, res) {
    try {
      const run = await SyncRun.getById(req.params.id);
      if (!run) return res.status(404).json({ error: 'Sync run not found' });
      res.json({ run });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch sync run: ' + err.message });
    }
  },

  /**
   * GET /api/diagnostics/sync-runs/:id/emails - Emails in a sync run
   */
  async getSyncRunEmails(req, res) {
    try {
      const { limit = 100, offset = 0, status, error_type } = req.query;
      const emails = await RawEmail.getBySyncRun(req.params.id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status,
        errorType: error_type,
      });
      res.json({ emails });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch emails: ' + err.message });
    }
  },

  /**
   * GET /api/diagnostics/sync-runs/:id/errors - Only failed emails
   */
  async getSyncRunErrors(req, res) {
    try {
      const emails = await RawEmail.getBySyncRun(req.params.id, { status: 'failed' });
      res.json({ errors: emails });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch errors: ' + err.message });
    }
  },

  /**
   * GET /api/diagnostics/email/:id - Full email detail
   */
  async getEmailDetail(req, res) {
    try {
      const email = await RawEmail.getById(req.params.id);
      if (!email) return res.status(404).json({ error: 'Email not found' });
      // Strip large body fields for API response
      const { body_html, body_text, ...rest } = email;
      res.json({
        email: {
          ...rest,
          body_preview: (body_text || body_html || '').substring(0, 500),
          has_html: !!body_html,
          has_text: !!body_text,
        },
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch email: ' + err.message });
    }
  },

  /**
   * GET /api/diagnostics/stats - Aggregate stats
   */
  async getStats(req, res) {
    try {
      const [aggregate, errors, latestRun] = await Promise.all([
        RawEmail.getAggregateStats(req.userId),
        RawEmail.getErrorBreakdown(req.userId),
        SyncRun.getLatest(req.userId),
      ]);
      res.json({ aggregate, errors, latestRun });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch stats: ' + err.message });
    }
  },

  /**
   * GET /api/diagnostics/senders - Per-sender breakdown
   */
  async getSenderStats(req, res) {
    try {
      const senders = await RawEmail.getSenderStats(req.userId);
      res.json({ senders });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch sender stats: ' + err.message });
    }
  },

  /**
   * GET /api/diagnostics/parser-performance - Per-parser stats
   */
  async getParserPerformance(req, res) {
    try {
      const parsers = await RawEmail.getParserStats(req.userId);
      res.json({ parsers });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch parser stats: ' + err.message });
    }
  },

  /**
   * GET /api/diagnostics/llm-usage - LLM cost/usage stats
   */
  async getLLMUsage(req, res) {
    try {
      const runs = await SyncRun.getByUser(req.userId, { limit: 50 });
      const totals = runs.reduce((acc, run) => ({
        total_calls: acc.total_calls + (run.llm_calls || 0),
        total_tokens: acc.total_tokens + (run.llm_tokens_total || 0),
        total_cost_usd: acc.total_cost_usd + parseFloat(run.llm_cost_usd || 0),
      }), { total_calls: 0, total_tokens: 0, total_cost_usd: 0 });

      const perRun = runs
        .filter(r => r.llm_calls > 0)
        .map(r => ({
          id: r.id,
          started_at: r.started_at,
          llm_calls: r.llm_calls,
          llm_tokens: r.llm_tokens_total,
          llm_cost_usd: r.llm_cost_usd,
        }));

      res.json({ totals, perRun });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch LLM usage: ' + err.message });
    }
  },
};

module.exports = diagnosticsController;
