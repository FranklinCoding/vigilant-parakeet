/**
 * syncPrices.js — VaultDeal price sync job
 *
 * Fetches current deals from CheapShark across multiple pages,
 * upserts game metadata from Steam, writes price snapshots with
 * direct Steam store links, then refreshes the materialized view.
 *
 * Run manually:  node server/jobs/syncPrices.js
 * Run via cron:  configured in render.yaml (every 3 hours)
 */

require('dotenv').config();

const https = require('https');
const config = require('../src/config');
const db = require('../src/db');

const PAGE_SIZE = 60;   // CheapShark max per page
const PAGES_TO_FETCH = 5; // 5 × 60 = 300 games per run
const STEAM_APP_DETAIL_URL = `${config.steamApiBaseUrl}/appdetails`;

// ─── helpers ────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 10000 }, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)); }
        });
      })
      .on('error', reject)
      .on('timeout', function () { this.destroy(new Error(`Timeout: ${url}`)); });
  });
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function steamStoreUrl(steamAppId) {
  return `https://store.steampowered.com/app/${steamAppId}/`;
}

// ─── Steam metadata fetch ────────────────────────────────────────────────────

async function fetchSteamMeta(steamAppId) {
  try {
    const data = await fetchJson(`${STEAM_APP_DETAIL_URL}?appids=${steamAppId}&cc=us&l=en`);
    const entry = data[String(steamAppId)];
    if (!entry?.success) return null;
    return entry.data;
  } catch {
    return null;
  }
}

// ─── upsert game ────────────────────────────────────────────────────────────

async function upsertGame(deal, steamMeta) {
  const steamAppId = parseInt(deal.steamAppID);
  if (isNaN(steamAppId)) return null;

  const title = deal.title || steamMeta?.name || 'Unknown';
  const slug = slugify(title);
  const genres = steamMeta?.genres?.map((g) => g.description) ?? [];
  const tags = steamMeta?.categories?.map((c) => c.description) ?? [];
  const developers = steamMeta?.developers ?? [];
  const publishers = steamMeta?.publishers ?? [];
  const releaseDate =
    steamMeta?.release_date?.coming_soon === false && steamMeta?.release_date?.date
      ? steamMeta.release_date.date
      : null;
  const metacriticScore = steamMeta?.metacritic?.score ?? null;
  const reviewScore = parseInt(deal.steamRatingPercent) || null;
  const reviewDesc = deal.steamRatingText || null;
  const shortDesc = steamMeta?.short_description ?? null;
  const headerImage = steamMeta?.header_image
    ?? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
  const isFree = steamMeta?.is_free ?? false;

  const { rows } = await db.query(
    `INSERT INTO games (
       steam_app_id, title, slug, short_description, header_image,
       developers, publishers, release_date, metacritic_score,
       steam_review_score, steam_review_desc, genres, tags,
       is_free, metadata_fetched_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
     ON CONFLICT (steam_app_id) DO UPDATE SET
       title               = EXCLUDED.title,
       slug                = EXCLUDED.slug,
       short_description   = COALESCE(EXCLUDED.short_description, games.short_description),
       header_image        = COALESCE(EXCLUDED.header_image, games.header_image),
       developers          = COALESCE(EXCLUDED.developers, games.developers),
       publishers          = COALESCE(EXCLUDED.publishers, games.publishers),
       release_date        = COALESCE(EXCLUDED.release_date, games.release_date),
       metacritic_score    = COALESCE(EXCLUDED.metacritic_score, games.metacritic_score),
       steam_review_score  = COALESCE(EXCLUDED.steam_review_score, games.steam_review_score),
       steam_review_desc   = COALESCE(EXCLUDED.steam_review_desc, games.steam_review_desc),
       genres              = COALESCE(EXCLUDED.genres, games.genres),
       tags                = COALESCE(EXCLUDED.tags, games.tags),
       is_free             = EXCLUDED.is_free,
       metadata_fetched_at = NOW(),
       updated_at          = NOW()
     RETURNING id`,
    [
      steamAppId, title, slug, shortDesc, headerImage,
      developers, publishers, releaseDate, metacriticScore,
      reviewScore, reviewDesc, genres, tags, isFree,
    ]
  );

  return rows[0].id;
}

// ─── insert price snapshot ───────────────────────────────────────────────────

async function insertSnapshot(gameId, deal) {
  const steamAppId = parseInt(deal.steamAppID);
  const priceCurrent = parseFloat(deal.salePrice);
  const priceRegular = parseFloat(deal.normalPrice);
  const discountPct = parseInt(deal.savings);
  const isOnSale = discountPct > 0;

  await db.query(
    `INSERT INTO price_snapshots
       (game_id, store, price_current, price_regular, discount_pct, is_on_sale, deal_id, deal_url)
     VALUES ($1, 'steam', $2, $3, $4, $5, $6, $7)`,
    [
      gameId,
      priceCurrent,
      priceRegular,
      discountPct,
      isOnSale,
      deal.dealID,
      steamStoreUrl(steamAppId),  // Direct Steam link — no CheapShark redirect
    ]
  );
}

// ─── update price stats ──────────────────────────────────────────────────────

async function updatePriceStats(gameId) {
  await db.query(
    `INSERT INTO price_stats (game_id, store, all_time_low, all_time_low_date, all_time_high, avg_discount_pct, updated_at)
     SELECT
       $1, 'steam',
       MIN(price_current),
       MIN(recorded_at) FILTER (WHERE price_current = (SELECT MIN(p2.price_current) FROM price_snapshots p2 WHERE p2.game_id = $1 AND p2.store = 'steam')),
       MAX(price_regular),
       ROUND(AVG(discount_pct))::SMALLINT,
       NOW()
     FROM price_snapshots
     WHERE game_id = $1 AND store = 'steam'
     ON CONFLICT (game_id, store) DO UPDATE SET
       all_time_low      = LEAST(price_stats.all_time_low, EXCLUDED.all_time_low),
       all_time_low_date = CASE WHEN EXCLUDED.all_time_low < price_stats.all_time_low THEN EXCLUDED.all_time_low_date ELSE price_stats.all_time_low_date END,
       all_time_high     = GREATEST(price_stats.all_time_high, EXCLUDED.all_time_high),
       avg_discount_pct  = EXCLUDED.avg_discount_pct,
       updated_at        = NOW()`,
    [gameId]
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  const startedAt = new Date();
  let gamesSync = 0;
  const errors = [];
  const seen = new Set(); // deduplicate across pages

  console.log('[sync] Starting CheapShark price sync…');

  // Fetch multiple pages so we get a much larger catalog
  for (let page = 0; page < PAGES_TO_FETCH; page++) {
    const url =
      `${config.cheapsharkBaseUrl}/deals` +
      `?storeID=1&pageSize=${PAGE_SIZE}&pageNumber=${page}` +
      `&sortBy=Deal+Rating&onSale=1`;

    let deals;
    try {
      deals = await fetchJson(url);
      if (!Array.isArray(deals) || deals.length === 0) break;
    } catch (err) {
      console.error(`[sync] Failed to fetch page ${page}:`, err.message);
      errors.push(`page_${page}: ${err.message}`);
      break;
    }

    console.log(`[sync] Page ${page}: ${deals.length} deals`);

    for (const deal of deals) {
      const steamAppId = parseInt(deal.steamAppID);
      if (isNaN(steamAppId) || steamAppId === 0) continue;
      if (seen.has(steamAppId)) continue;
      seen.add(steamAppId);

      try {
        await sleep(250); // be polite to Steam API
        const steamMeta = await fetchSteamMeta(steamAppId);
        const gameId = await upsertGame(deal, steamMeta);
        if (!gameId) continue;

        await insertSnapshot(gameId, deal);
        await updatePriceStats(gameId);

        gamesSync++;
        console.log(`[sync] ✓ ${deal.title} (${steamAppId})`);
      } catch (err) {
        console.error(`[sync] ✗ ${deal.title}:`, err.message);
        errors.push(`${deal.title}: ${err.message}`);
      }
    }

    // Small pause between pages
    if (page < PAGES_TO_FETCH - 1) await sleep(500);
  }

  // Refresh materialized view
  try {
    await db.query('SELECT refresh_current_deals()');
    console.log('[sync] Materialized view refreshed');
  } catch (err) {
    console.error('[sync] Failed to refresh view:', err.message);
    errors.push(`refresh_view: ${err.message}`);
  }

  const status = errors.length === 0 ? 'success' : gamesSync > 0 ? 'partial' : 'failed';
  await logSync('cheapshark_deals', status, gamesSync, errors, startedAt);

  console.log(`[sync] Done — ${gamesSync} games synced, ${errors.length} errors (${status})`);
  process.exit(0);
}

async function logSync(jobName, status, gamesSynced, errors, startedAt) {
  try {
    await db.query(
      `INSERT INTO sync_log (job_name, status, games_synced, errors, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [jobName, status, gamesSynced, JSON.stringify(errors), startedAt]
    );
  } catch (err) {
    console.error('[sync] Failed to write sync_log:', err.message);
  }
}

run().catch((err) => {
  console.error('[sync] Unhandled error:', err);
  process.exit(1);
});
