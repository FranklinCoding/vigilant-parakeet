const { Router } = require('express');
const https = require('https');
const db = require('../db');
const config = require('../config');

const router = Router();

// GET /api/games/:gameId/trailer
// Returns cached YouTube videoId for a game, searching YouTube on first hit.
// Critical: YouTube search costs 100 quota units/call (only 100 free/day).
// Always reads from DB first; writes back on first search.
router.get('/:gameId/trailer', async (req, res, next) => {
  try {
    const gameId = parseInt(req.params.gameId);
    if (isNaN(gameId)) return res.status(400).json({ error: 'Invalid gameId' });

    // Check DB cache first
    const { rows } = await db.query(
      'SELECT youtube_trailer_id, title FROM games WHERE id = $1',
      [gameId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });

    const { youtube_trailer_id, title } = rows[0];

    if (youtube_trailer_id) {
      return res.json({ videoId: youtube_trailer_id });
    }

    if (!config.youtubeApiKey) {
      return res.json({ videoId: null, reason: 'not_configured' });
    }

    // Search YouTube for the trailer
    const q = encodeURIComponent(`${title} official trailer`);
    const ytUrl =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&q=${q}&type=video&maxResults=3&key=${config.youtubeApiKey}`;

    const ytData = await new Promise((resolve, reject) => {
      https
        .get(ytUrl, { timeout: 10000 }, (ytRes) => {
          let raw = '';
          ytRes.on('data', (chunk) => (raw += chunk));
          ytRes.on('end', () => {
            try { resolve(JSON.parse(raw)); }
            catch (e) { reject(e); }
          });
        })
        .on('error', reject)
        .on('timeout', function () { this.destroy(new Error('YouTube API timeout')); });
    });

    const videoId = ytData?.items?.[0]?.id?.videoId ?? null;

    if (videoId) {
      // Non-blocking write — don't await so response isn't delayed
      db.query('UPDATE games SET youtube_trailer_id = $1 WHERE id = $2', [videoId, gameId])
        .catch((err) => console.error('[trailer] Failed to cache videoId:', err.message));
    }

    res.json({ videoId });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/:steamAppId
// Returns full game record + last 90 days of price history
router.get('/:steamAppId', async (req, res, next) => {
  try {
    const steamAppId = parseInt(req.params.steamAppId);
    if (isNaN(steamAppId)) return res.status(400).json({ error: 'Invalid steamAppId' });

    const { rows } = await db.query(
      `SELECT
         g.*,
         COALESCE(
           json_agg(
             json_build_object(
               'store',         ps.store,
               'price_current', ps.price_current,
               'price_regular', ps.price_regular,
               'discount_pct',  ps.discount_pct,
             'is_on_sale',    ps.is_on_sale,
             'store_type',    ps.store_type,
             'promo_type',    ps.promo_type,
             'promo_label',   ps.promo_label,
             'promo_starts_at', ps.promo_starts_at,
             'promo_ends_at', ps.promo_ends_at,
             'sale_ends_at',  ps.sale_ends_at,
             'deal_url',      ps.deal_url,
             'recorded_at',   ps.recorded_at
             ) ORDER BY ps.recorded_at DESC
           ) FILTER (WHERE ps.id IS NOT NULL),
           '[]'
         ) AS price_history
       FROM games g
       LEFT JOIN price_snapshots ps
         ON ps.game_id = g.id
         AND ps.recorded_at >= NOW() - INTERVAL '90 days'
       WHERE g.steam_app_id = $1
       GROUP BY g.id`,
      [steamAppId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
