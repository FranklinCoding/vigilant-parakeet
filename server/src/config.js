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
  // Steam Web API key — required for library/recently-played features
  // Get one free at: https://steamcommunity.com/dev/apikey
  steamApiKey: process.env.STEAM_API_KEY || null,
  // G2A Marketplace API — requires merchant account at https://developers.g2a.com
  g2aClientId: process.env.G2A_CLIENT_ID || null,
  g2aClientSecret: process.env.G2A_CLIENT_SECRET || null,
  // Kinguin API — requires partner account at https://www.kinguin.net/partner
  kinguinApiKey: process.env.KINGUIN_API_KEY || null,
  // IsThereAnyDeal API — free key at https://isthereanydeal.com/dev/app/
  itadApiKey: process.env.ITAD_API_KEY || null,
  // Auth — server public URL (used for Steam OpenID return URL)
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3001',
  // Auth — frontend URL to redirect to after login (same as appBaseUrl in production)
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // JWT signing secret — auto-generated on Render, set manually in .env
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-please-change-in-production',
  // YouTube Data API v3 — free key at https://console.cloud.google.com
  // 100 searches/day on free tier — cache results in DB to avoid burning quota
  youtubeApiKey: process.env.YOUTUBE_API_KEY || null,
};
