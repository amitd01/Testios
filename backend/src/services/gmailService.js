const { google } = require('googleapis');
const config = require('../config');
const User = require('../models/User');

class GmailService {
  constructor(userId) {
    this.userId = userId;
    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  /**
   * Generate OAuth consent URL
   */
  static getAuthUrl(state) {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: config.google.scopes,
      prompt: 'consent',
      state,
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  static async getTokensFromCode(code) {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  /**
   * Get user profile from Google
   */
  static async getUserProfile(tokens) {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data;
  }

  /**
   * Initialize with user's stored tokens
   */
  async init() {
    const tokens = await User.getDecryptedTokens(this.userId);
    if (!tokens || !tokens.refreshToken) {
      throw new Error('No Gmail tokens found for user');
    }

    this.oauth2Client.setCredentials({
      refresh_token: tokens.refreshToken,
      access_token: tokens.accessToken,
    });

    // Auto-refresh token
    this.oauth2Client.on('tokens', async (newTokens) => {
      await User.updateTokens(this.userId, {
        accessToken: newTokens.access_token,
        tokenExpiry: new Date(newTokens.expiry_date),
        ...(newTokens.refresh_token && { refreshToken: newTokens.refresh_token }),
      });
    });

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    return this;
  }

  /**
   * List messages matching a query
   * Returns { messages, timing: { duration_ms, api_calls } }
   */
  async listMessages(query, maxResults = 500) {
    const startTime = Date.now();
    let apiCalls = 0;
    const messages = [];
    let pageToken = null;

    do {
      apiCalls++;
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(maxResults - messages.length, 500),
        pageToken,
      });

      if (response.data.messages) {
        messages.push(...response.data.messages);
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken && messages.length < maxResults);

    return { messages, timing: { duration_ms: Date.now() - startTime, api_calls: apiCalls } };
  }

  /**
   * Get full message content with timing
   * Returns { data, timing: { duration_ms } }
   */
  async getMessage(messageId) {
    const startTime = Date.now();
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    return { data: response.data, timing: { duration_ms: Date.now() - startTime } };
  }

  /**
   * Get attachment content with timing
   * Returns { buffer, timing: { duration_ms } }
   */
  async getAttachment(messageId, attachmentId) {
    const startTime = Date.now();
    const response = await this.gmail.users.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });
    return {
      buffer: Buffer.from(response.data.data, 'base64'),
      timing: { duration_ms: Date.now() - startTime },
    };
  }

  /**
   * Extract structured data from a Gmail message
   */
  static parseMessage(message) {
    const headers = message.payload.headers || [];
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : null;
    };

    const from = getHeader('From') || '';
    const senderMatch = from.match(/<(.+?)>/) || from.match(/([^\s]+@[^\s]+)/);
    const sender = senderMatch ? senderMatch[1].toLowerCase() : from.toLowerCase();

    const dateStr = getHeader('Date');
    const receivedAt = dateStr ? new Date(dateStr) : new Date();

    // Extract body
    const { html, text } = GmailService.extractBody(message.payload);

    // Extract attachments
    const attachments = GmailService.extractAttachments(message.payload);

    return {
      gmail_message_id: message.id,
      sender,
      subject: getHeader('Subject') || '',
      body_html: html,
      body_text: text,
      attachments,
      received_at: receivedAt,
    };
  }

  /**
   * Extract HTML and text body from message payload
   */
  static extractBody(payload) {
    let html = '';
    let text = '';

    function traverseParts(parts) {
      if (!parts) return;
      for (const part of parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          html += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/plain' && part.body?.data) {
          text += Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.parts) traverseParts(part.parts);
      }
    }

    if (payload.mimeType === 'text/html' && payload.body?.data) {
      html = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.mimeType === 'text/plain' && payload.body?.data) {
      text = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    if (payload.parts) traverseParts(payload.parts);

    return { html, text };
  }

  /**
   * Extract attachment metadata from message payload
   */
  static extractAttachments(payload) {
    const attachments = [];

    function traverseParts(parts) {
      if (!parts) return;
      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId,
          });
        }
        if (part.parts) traverseParts(part.parts);
      }
    }

    if (payload.parts) traverseParts(payload.parts);
    return attachments;
  }
}

module.exports = GmailService;
