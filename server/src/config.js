require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  cheapsharkBaseUrl:
    process.env.CHEAPSHARK_BASE_URL || 'https://www.cheapshark.com/api/1.0',
  steamApiBaseUrl:
    process.env.STEAM_API_BASE_URL || 'https://store.steampowered.com/api',
  dealsFetchLimit: parseInt(process.env.DEALS_FETCH_LIMIT) || 100,
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : '*',
  // Phase 2 — set manually in Render dashboard, not used in Phase 1
  // steamApiKey: process.env.STEAM_API_KEY,
  // itadApiKey: process.env.ITAD_API_KEY,
  // jwtSecret: process.env.JWT_SECRET,
  // sessionSecret: process.env.SESSION_SECRET,
  // appBaseUrl: process.env.APP_BASE_URL,
  // emailApiKey: process.env.EMAIL_API_KEY,
  // emailFrom: process.env.EMAIL_FROM,
};
