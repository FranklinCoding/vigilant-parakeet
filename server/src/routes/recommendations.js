/**
 * recommendations.js — VaultDeal "For You" recommendations
 *
 * Fetches a user's Steam library, extracts genre preferences from their
 * top played games, then finds matching current deals they don't own yet.
 *
 * GET /api/recommendations?steamId=:steamId64
 */

const { Router } = require('express');
const https = require('https');
const config = require('../config');
const db = require('../db');

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https
      .request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers: { 'User-Agent': 'VaultDeal/1.0', Accept: 'application/json' },
          timeout: 10000,
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => resolve({ status: res.statusCode, raw }));
        }
      )
      .on('error', reject)
      .on('timeout', function () {
        this.destroy(new Error('Request timed out'));
      })
      .end();
  });
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchSteamGenres(appId) {
  try {
    const { raw } = await httpGet(
      `${config.steamApiBaseUrl}/appdetails?appids=${appId}&cc=us&l=en`
    );
    const data = tryParseJson(raw);
    const entry = data?.[String(appId)];
    if (!entry?.success) return [];
    return entry.data?.genres?.map((g) => g.description) ?? [];
  } catch {
    return [];
  }
}

// ─── GET /api/recommendations?steamId=:id ───────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { steamId } = req.query;

    if (!steamId) {
      return res.status(400).json({ error: 'steamId query parameter is required' });
    }

    if (!config.steamApiKey) {
      return res.status(503).json({ error: 'Steam API key not configured on the server' });
    }

    // 1. Fetch user's Steam library
    const libraryUrl =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
      `?key=${config.steamApiKey}&steamid=${steamId}` +
      `&include_appinfo=true&include_played_free_games=true`;

    const { raw: libRaw, status: libStatus } = await httpGet(libraryUrl);

    if (libStatus !== 200) {
      return res.status(502).json({ error: 'Failed to fetch Steam library' });
    }

    const libData = tryParseJson(libRaw);

    if (!libData?.response?.games) {
      return res.status(403).json({
        error:
          'Steam library is private or empty. Set your Steam game details visibility to public at steamcommunity.com/my/edit/settings.',
      });
    }

    const allGames = libData.response.games.sort(
      (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)
    );
    const ownedAppIds = allGames.map((g) => g.appid);

    // 2. Pick top 5 seed games by playtime (fall back to first 5 if nothing played)
    const played = allGames.filter((g) => g.playtime_forever > 0);
    const seedGames = (played.length > 0 ? played : allGames).slice(0, 5);

    // 3. Fetch Steam genres for each seed game (in parallel)
    const seedWithGenres = await Promise.all(
      seedGames.map(async (g) => ({
        appId: g.appid,
        name: g.name,
        playtimeMins: g.playtime_forever || 0,
        genres: await fetchSteamGenres(g.appid),
      }))
    );

    // 4. Build weighted genre profile: weight = log(1 + playtime)
    const genreWeights = {};
    for (const game of seedWithGenres) {
      const weight = Math.log(1 + game.playtimeMins);
      for (const genre of game.genres) {
        genreWeights[genre] = (genreWeights[genre] || 0) + weight;
      }
    }

    // Normalize to 0–1
    const maxWeight = Math.max(...Object.values(genreWeights), 1);
    const topGenres = Object.entries(genreWeights)
      .map(([genre, w]) => ({ genre, score: w / maxWeight }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (topGenres.length === 0) {
      return res.status(422).json({
        error: 'Could not determine genre preferences from your library.',
      });
    }

    const genreList = topGenres.map((t) => t.genre);

    // 5. Query current_deals for matching games not in user's library
    const { rows } = await db.query(
      `SELECT
         cd.game_id,
         cd.title,
         cd.slug,
         cd.header_image,
         cd.store,
         cd.price_current,
         cd.price_regular,
         cd.discount_pct,
         cd.is_on_sale,
         cd.deal_url,
         cd.genres,
         cd.steam_app_id,
         cd.steam_review_score,
         cd.steam_review_desc,
         cd.metacritic_score,
         g.total_reviews,
         ps.avg_discount_pct,
         COALESCE(
           array_length(
             ARRAY(SELECT unnest(cd.genres) INTERSECT SELECT unnest($1::text[])),
             1
           ),
           0
         ) AS matched_genres
       FROM current_deals cd
       JOIN games g ON g.id = cd.game_id
       LEFT JOIN price_stats ps ON ps.game_id = cd.game_id AND ps.store = 'steam'
       WHERE cd.is_on_sale = TRUE
         AND NOT (cd.steam_app_id = ANY($2::int[]))
         AND cd.genres && $1::text[]`,
      [genreList, ownedAppIds]
    );

    if (rows.length === 0) {
      return res.json({
        seedGames: seedWithGenres.map((g) => ({
          name: g.name,
          playtimeMins: g.playtimeMins,
          genres: g.genres,
        })),
        topGenres,
        topPicks: [],
        hiddenGems: [],
      });
    }

    // 6. Score results: 70% genre overlap + 30% discount
    const maxMatched = Math.max(...rows.map((r) => r.matched_genres), 1);

    const scored = rows
      .map((r) => {
        const tagOverlap = r.matched_genres / maxMatched;
        const discountScore = (r.discount_pct || 0) / 100;
        const score = 0.7 * tagOverlap + 0.3 * discountScore;
        return { ...r, score };
      })
      .sort((a, b) => b.score - a.score);

    // 7. Split into top picks and hidden gems
    const topPicks = scored.slice(0, 12);

    const topPickIds = new Set(topPicks.slice(0, 6).map((r) => r.game_id));
    const hiddenGems = scored
      .filter(
        (r) =>
          !topPickIds.has(r.game_id) &&
          r.total_reviews != null &&
          r.total_reviews >= 750 &&
          r.total_reviews <= 10000 &&
          r.steam_review_score != null &&
          r.steam_review_score >= 70
      )
      .sort((a, b) => b.steam_review_score - a.steam_review_score || b.score - a.score)
      .slice(0, 12);

    res.json({
      seedGames: seedWithGenres.map((g) => ({
        name: g.name,
        playtimeMins: g.playtimeMins,
        genres: g.genres,
      })),
      topGenres,
      topPicks,
      hiddenGems,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
