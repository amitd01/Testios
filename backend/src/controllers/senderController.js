const { getAllSenders, addSender, deactivateSender, getPendingSenders, approvePendingSender } = require('../services/senderService');
const { getAllTemplates } = require('../services/templateRegistry');

const senderController = {
  /**
   * GET /api/admin/senders - List all sender domains
   */
  async listSenders(req, res) {
    try {
      const { type, active } = req.query;
      const senders = await getAllSenders({
        type,
        active: active !== undefined ? active === 'true' : undefined,
      });
      res.json({ senders });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch senders: ' + err.message });
    }
  },

  /**
   * POST /api/admin/senders - Add new sender domain
   */
  async addSender(req, res) {
    try {
      const { domain, institutionName, institutionType } = req.body;
      if (!domain || !institutionName || !institutionType) {
        return res.status(400).json({ error: 'domain, institutionName, and institutionType are required' });
      }
      const sender = await addSender(domain, { institutionName, institutionType, addedBy: 'user' });
      res.json({ sender });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add sender: ' + err.message });
    }
  },

  /**
   * DELETE /api/admin/senders/:domain - Deactivate sender
   */
  async removeSender(req, res) {
    try {
      await deactivateSender(req.params.domain);
      res.json({ message: 'Sender deactivated' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to deactivate sender: ' + err.message });
    }
  },

  /**
   * GET /api/admin/senders/pending - List pending senders
   */
  async listPending(req, res) {
    try {
      const pending = await getPendingSenders();
      res.json({ pending });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch pending senders: ' + err.message });
    }
  },

  /**
   * POST /api/admin/senders/pending/:id/approve - Approve pending sender
   */
  async approvePending(req, res) {
    try {
      const { institutionName, institutionType } = req.body;
      if (!institutionName || !institutionType) {
        return res.status(400).json({ error: 'institutionName and institutionType are required' });
      }
      const sender = await approvePendingSender(req.params.id, { institutionName, institutionType });
      if (!sender) return res.status(404).json({ error: 'Pending sender not found' });
      res.json({ sender });
    } catch (err) {
      res.status(500).json({ error: 'Failed to approve sender: ' + err.message });
    }
  },

  /**
   * GET /api/admin/templates - List email templates
   */
  async listTemplates(req, res) {
    try {
      const templates = await getAllTemplates();
      res.json({ templates });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch templates: ' + err.message });
    }
  },
};

module.exports = senderController;
