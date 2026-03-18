const { Router } = require('express');
const db = require('../db');

const router = Router();

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
