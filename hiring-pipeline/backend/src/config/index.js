module.exports = {
  port: process.env.PORT || 3002,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/hiring_pipeline',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3003',
};
