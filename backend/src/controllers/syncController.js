const EmailProcessingEngine = require('../services/emailProcessingEngine');
const User = require('../models/User');

const syncController = {
  /**
   * POST /api/sync/start - Trigger email sync
   */
  async startSync(req, res) {
    try {
      const user = await User.findById(req.userId);
      const engine = new EmailProcessingEngine(req.userId);

      // Incremental sync: only fetch emails since last sync
      const stats = await engine.runFullSync({
        sinceDate: user.gmail_last_sync ? new Date(user.gmail_last_sync) : undefined,
      });
      res.json({ message: 'Sync completed', stats });
    } catch (err) {
      console.error('Sync error:', err);
      res.status(500).json({ error: 'Email sync failed: ' + err.message });
    }
  },

  /**
   * POST /api/sync/onboarding - Run initial scan (30 days for test runs)
   */
  async onboardingScan(req, res) {
    try {
      const { days = 30 } = req.body;
      const engine = new EmailProcessingEngine(req.userId);
      const stats = await engine.runOnboardingScan(days);
      await User.setOnboarded(req.userId);
      res.json({ message: 'Onboarding scan completed', stats });
    } catch (err) {
      console.error('Onboarding scan error:', err);
      res.status(500).json({ error: 'Onboarding scan failed: ' + err.message });
    }
  },

  /**
   * POST /api/sync/reparse - Re-parse all stored emails with updated parsing logic
   * Does not re-fetch from Gmail. Clears existing transactions and re-processes stored emails.
   */
  async reparse(req, res) {
    try {
      const engine = new EmailProcessingEngine(req.userId);
      const stats = await engine.runReparse();
      res.json({ message: 'Re-parse completed', stats });
    } catch (err) {
      console.error('Re-parse error:', err);
      res.status(500).json({ error: 'Re-parse failed: ' + err.message });
    }
  },

  /**
   * GET /api/sync/status - Get sync status
   */
  async getStatus(req, res) {
    try {
      const user = await User.findById(req.userId);
      res.json({
        lastSync: user.gmail_last_sync,
        gmailConnected: !!user.gmail_refresh_token,
        onboarded: user.onboarded,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch sync status' });
    }
  },
};

module.exports = syncController;
