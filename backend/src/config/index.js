require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://pfm_user:pfm_pass@localhost:5432/pfm_india',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-bytes-long!',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3001/auth/google/callback',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
  },
  emailSync: {
    intervalSeconds: parseInt(process.env.EMAIL_SYNC_INTERVAL, 10) || 3600,
    initialScanDays: parseInt(process.env.INITIAL_SCAN_DAYS, 10) || 90,
  },
};
