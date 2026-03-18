require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  cheapsharkBaseUrl:
    process.env.CHEAPSHARK_BASE_URL || 'https://www.cheapshark.com/api/1.0',
  steamApiBaseUrl:
    process.env.STEAM_API_BASE_URL || 'https://store.steampowered.com/api',
  dealsCronSchedule: process.env.DEALS_CRON_SCHEDULE || '0 */2 * * *',
  dealsFetchLimit: parseInt(process.env.DEALS_FETCH_LIMIT) || 100,
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : '*',
};
