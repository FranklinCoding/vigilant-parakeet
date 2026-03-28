const { Router } = require('express');
const db = require('../db');
const { classifyStore } = require('../lib/storeTypes');

const router = Router();

// GET /api/deals
// Query params: sort, genre, minDiscount, maxPrice, store, page, limit, q
router.get('/', async (req, res, next) => {
  try {
    const {
      sort = 'discount',
      genre,
      minDiscount,
      maxPrice,
      store,
      storeType,
      promoType,
      freeOnly,
      page = 1,
      limit = 24,
      q,
    } = req.query;

    const filterParams = [];
    const conditions = ['cd.is_on_sale = TRUE'];

    if (genre) {
      filterParams.push(genre);
      // Search both official Steam genres AND user tags so sub-genres resolve correctly
      conditions.push(
        `($${filterParams.length} = ANY(cd.genres) OR $${filterParams.length} = ANY(cd.tags))`
      );
    }
    if (minDiscount) {
      filterParams.push(parseInt(minDiscount));
      conditions.push(`cd.discount_pct >= $${filterParams.length}`);
    }
    if (maxPrice) {
      filterParams.push(parseFloat(maxPrice));
      conditions.push(`cd.price_current <= $${filterParams.length}`);
    }
    if (store) {
      filterParams.push(store);
      conditions.push(`cd.store = $${filterParams.length}`);
    }
    if (storeType) {
      filterParams.push(storeType);
      conditions.push(`cd.store_type = $${filterParams.length}`);
    }
    if (promoType) {
      filterParams.push(promoType);
      conditions.push(`cd.promo_type = $${filterParams.length}`);
    }
    if (String(freeOnly) === '1' || String(freeOnly).toLowerCase() === 'true') {
      conditions.push(`(cd.promo_type = 'free' OR cd.price_current = 0)`);
    }
    if (q) {
      filterParams.push(`%${q}%`);
      conditions.push(`cd.title ILIKE $${filterParams.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const orderMap = {
      discount: 'cd.discount_pct DESC',
      price: 'cd.price_current ASC',
      title: 'cd.title ASC',
      rating: 'cd.steam_review_score DESC NULLS LAST',
    };
    const orderBy = orderMap[sort] || orderMap.discount;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const queryParams = [...filterParams, parseInt(limit), offset];
    const limitIdx = queryParams.length - 1;
    const offsetIdx = queryParams.length;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT
           cd.game_id,
           cd.title,
           cd.slug,
           cd.header_image,
           cd.store,
           cd.store_type,
           cd.price_current,
           cd.price_regular,
           cd.discount_pct,
           cd.promo_type,
           cd.promo_label,
           cd.promo_starts_at,
           cd.promo_ends_at,
           cd.sale_ends_at,
           cd.deal_url,
           cd.genres,
           cd.tags,
           cd.metacritic_score,
           cd.steam_review_score,
           cd.steam_review_desc,
           cd.steam_app_id,
           cd.is_free,
           cd.has_demo,
           cd.has_bundle,
           cd.recorded_at
         FROM current_deals cd
         ${where}
         ORDER BY ${orderBy}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        queryParams
      ),
      db.query(
        `SELECT COUNT(*) FROM current_deals cd ${where}`,
        filterParams
      ),
    ]);

    res.json({
      data: rows,
      meta: {
        total: parseInt(countRows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/deals/:gameId
router.get('/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;

    const { rows } = await db.query(
      `SELECT
         g.*,
         json_agg(
            json_build_object(
             'store',         cd.store,
             'store_type',    cd.store_type,
             'price_current', cd.price_current,
             'price_regular', cd.price_regular,
             'discount_pct',  cd.discount_pct,
             'promo_type',    cd.promo_type,
             'promo_label',   cd.promo_label,
             'promo_starts_at', cd.promo_starts_at,
             'promo_ends_at', cd.promo_ends_at,
             'sale_ends_at',  cd.sale_ends_at,
             'deal_url',      cd.deal_url,
             'recorded_at',   cd.recorded_at
           ) ORDER BY
             CASE WHEN COALESCE(cd.store_type, $2) = 'official' THEN 0 ELSE 1 END,
             cd.price_current ASC
         ) FILTER (WHERE cd.game_id IS NOT NULL) AS prices,
         ps.all_time_low,
         ps.all_time_low_date,
         ps.avg_discount_pct
       FROM games g
       LEFT JOIN current_deals cd ON cd.game_id = g.id
       LEFT JOIN price_stats ps ON ps.game_id = g.id AND ps.store = 'steam'
       WHERE g.id = $1
       GROUP BY g.id, ps.all_time_low, ps.all_time_low_date, ps.avg_discount_pct`,
      [parseInt(gameId), classifyStore('steam')]
    );

    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
