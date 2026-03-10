const GmailService = require('../services/gmailService');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const config = require('../config');

const authController = {
  /**
   * GET /auth/google - Redirect to Google OAuth consent screen
   */
  async initiateOAuth(req, res) {
    try {
      const authUrl = GmailService.getAuthUrl();
      res.json({ authUrl });
    } catch (err) {
      console.error('OAuth initiation error:', err);
      res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
  },

  /**
   * GET /auth/google/callback - Handle OAuth callback
   */
  async handleCallback(req, res) {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    try {
      // Exchange code for tokens
      const tokens = await GmailService.getTokensFromCode(code);

      // Get user profile
      const profile = await GmailService.getUserProfile(tokens);

      // Create or update user
      const user = await User.create({
        email: profile.email,
        name: profile.name,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      });

      // Generate JWT
      const jwt = generateToken(user.id);

      // Redirect to frontend with token
      res.redirect(`${config.frontendUrl}/auth/callback?token=${jwt}`);
    } catch (err) {
      console.error('OAuth callback error:', err);
      res.redirect(`${config.frontendUrl}/auth/error?message=${encodeURIComponent(err.message)}`);
    }
  },

  /**
   * GET /auth/me - Get current user
   */
  async getCurrentUser(req, res) {
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        onboarded: req.user.onboarded,
        gmailConnected: !!req.user.gmail_refresh_token,
        lastSync: req.user.gmail_last_sync,
      },
    });
  },

  /**
   * POST /auth/revoke - Revoke Gmail access and delete all data
   */
  async revokeAccess(req, res) {
    try {
      await User.deleteAllData(req.userId);
      res.json({ message: 'All data deleted and Gmail access revoked' });
    } catch (err) {
      console.error('Revoke access error:', err);
      res.status(500).json({ error: 'Failed to revoke access' });
    }
  },
};

module.exports = authController;
