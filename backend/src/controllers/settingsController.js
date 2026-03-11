const DocumentPassword = require('../models/DocumentPassword');

const settingsController = {
  async listDocumentPasswords(req, res) {
    try {
      const passwords = await DocumentPassword.getByUser(req.userId);
      res.json({ passwords });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch document passwords' });
    }
  },

  async upsertDocumentPassword(req, res) {
    try {
      const { institutionDomain, password, passwordHint } = req.body;
      if (!institutionDomain || !password) {
        return res.status(400).json({ error: 'institutionDomain and password are required' });
      }
      const result = await DocumentPassword.upsert({
        userId: req.userId,
        institutionDomain,
        password,
        passwordHint,
      });
      res.json({ password: result });
    } catch (err) {
      if (err.message === 'DOCUMENT_PASSWORD_KEY not set in environment') {
        return res.status(500).json({ error: 'Document password encryption not configured. Set DOCUMENT_PASSWORD_KEY in .env' });
      }
      res.status(500).json({ error: 'Failed to save document password' });
    }
  },

  async deleteDocumentPassword(req, res) {
    try {
      const deleted = await DocumentPassword.delete(req.params.id, req.userId);
      if (!deleted) {
        return res.status(404).json({ error: 'Password not found' });
      }
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete document password' });
    }
  },
};

module.exports = settingsController;
