/**
 * syncSteamStore.js — VaultDeal Steam Store catalog sync
 *
 * Pulls games directly from Steam's storefront APIs:
 *   - Featured categories (top sellers, new releases, specials/sale)
 *   - Steam search (top rated, most played) — 10 pages × 25 = 250 per category
 *
 * For each game found it upserts metadata and, if a price is available
 * from the appdetails API, writes a price snapshot.  Games that are free
 * or have no price data are still upserted so they appear in the catalog.
 *
 * Run manually:  node server/jobs/syncSteamStore.js
 * Run via cron:  configured in render.yaml (daily at 06:00 UTC)
 */

require('dotenv').config();

const https = require('https');
const config = require('../src/config');
const db = require('../src/db');

// ─── constants ───────────────────────────────────────────────────────────────

const STEAM_STORE_API  = 'https://store.steampowered.com/api';
const STEAM_SEARCH_URL = 'https://store.steampowered.com/search/results';
const APPDETAILS_URL   = `${config.steamApiBaseUrl}/appdetails`;

// Steam search categories to pull
const SEARCH_CATEGORIES = [
  { label: 'top_sellers',   params: 'filter=topsellers' },
  { label: 'new_releases',  params: 'filter=newreleases' },
  { label: 'top_rated',     params: 'filter=reviews&review_score_preference=1' },
  { label: 'specials',      params: 'specials=1' },
];
const SEARCH_PAGES      = 10;   // 10 × 25 = 250 per category
const SEARCH_PAGE_SIZE  = 25;

// ─── helpers ─────────────────────────────────────────────────────────────────

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 15000, ...options }, (res) => {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function steamStoreUrl(steamAppId) {
  return `https://store.steampowered.com/app/${steamAppId}/`;
}

// ─── Steam appdetails fetch ───────────────────────────────────────────────────

async function fetchAppDetails(steamAppId) {
  try {
    const data = await fetchJson(`${APPDETAILS_URL}?appids=${steamAppId}&cc=us&l=en`);
    const entry = data[String(steamAppId)];
    if (!entry?.success) return null;
    return entry.data;
  } catch {
    return null;
  }
}

// ─── Steam search results (JSON endpoint) ────────────────────────────────────

async function fetchSearchPage(categoryParams, page) {
  const start = page * SEARCH_PAGE_SIZE;
  const url =
    `${STEAM_SEARCH_URL}?json=1&${categoryParams}` +
    `&start=${start}&count=${SEARCH_PAGE_SIZE}&cc=US&l=english`;
  try {
    const data = await fetchJson(url);
    // Steam returns { total_count, start, pagesize, items: [{appid, name, ...}] }
    if (!Array.isArray(data?.items)) return [];
    return data.items.filter((item) => item.type === 'app' && item.appid);
  } catch {
    return [];
  }
}

// ─── Steam featured categories (top sellers, specials, etc.) ─────────────────

async function fetchFeaturedCategories() {
  try {
    const data = await fetchJson(`${STEAM_STORE_API}/featuredcategories?cc=US&l=en`);
    const appIds = new Set();

    const sections = [
      data?.top_sellers?.items,
      data?.new_releases?.items,
      data?.specials?.items,
      data?.coming_soon?.items,
    ];

    for (const items of sections) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item.id) appIds.add(item.id);
      }
    }

    return [...appIds];
  } catch {
    return [];
  }
}

// ─── upsert game ─────────────────────────────────────────────────────────────

async function upsertGame(steamAppId, meta) {
  if (!meta) return null;

  const title       = meta.name || 'Unknown';
  const slug        = slugify(title);
  const genres      = meta.genres?.map((g) => g.description) ?? [];
  const tags        = meta.categories?.map((c) => c.description) ?? [];
  const developers  = meta.developers ?? [];
  const publishers  = meta.publishers ?? [];
  const releaseDate =
    meta.release_date?.coming_soon === false && meta.release_date?.date
      ? meta.release_date.date
      : null;
  const metacriticScore = meta.metacritic?.score ?? null;
  const shortDesc   = meta.short_description ?? null;
  const headerImage = meta.header_image
    ?? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
  const isFree      = meta.is_free ?? false;

  const { rows } = await db.query(
    `INSERT INTO games (
       steam_app_id, title, slug, short_description, header_image,
       developers, publishers, release_date, metacritic_score,
       genres, tags, is_free, metadata_fetched_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (steam_app_id) DO UPDATE SET
       title               = EXCLUDED.title,
       slug                = EXCLUDED.slug,
       short_description   = COALESCE(EXCLUDED.short_description, games.short_description),
       header_image        = COALESCE(EXCLUDED.header_image, games.header_image),
       developers          = COALESCE(EXCLUDED.developers, games.developers),
       publishers          = COALESCE(EXCLUDED.publishers, games.publishers),
       release_date        = COALESCE(EXCLUDED.release_date, games.release_date),
       metacritic_score    = COALESCE(EXCLUDED.metacritic_score, games.metacritic_score),
       genres              = COALESCE(EXCLUDED.genres, games.genres),
       tags                = COALESCE(EXCLUDED.tags, games.tags),
       is_free             = EXCLUDED.is_free,
       metadata_fetched_at = NOW(),
       updated_at          = NOW()
     RETURNING id`,
    [
      steamAppId, title, slug, shortDesc, headerImage,
      developers, publishers, releaseDate, metacriticScore,
      genres, tags, isFree,
    ]
  );

  return rows[0].id;
}

// ─── insert price snapshot (only if price data exists) ───────────────────────

async function insertSnapshot(gameId, steamAppId, meta) {
  const priceOverview = meta.price_overview;
  if (!priceOverview) return; // free game or no price data

  const priceCurrent = (priceOverview.final ?? 0) / 100;
  const priceRegular = (priceOverview.initial ?? 0) / 100;
  const discountPct  = priceOverview.discount_percent ?? 0;
  const isOnSale     = discountPct > 0;

  await db.query(
    `INSERT INTO price_snapshots
       (game_id, store, price_current, price_regular, discount_pct, is_on_sale, deal_url)
     VALUES ($1, 'steam', $2, $3, $4, $5, $6)`,
    [gameId, priceCurrent, priceRegular, discountPct, isOnSale, steamStoreUrl(steamAppId)]
  );
}

// ─── update price stats ───────────────────────────────────────────────────────

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

// ─── process a single app ID ─────────────────────────────────────────────────

async function processApp(steamAppId, seen, stats) {
  if (seen.has(steamAppId)) return;
  seen.add(steamAppId);

  try {
    await sleep(300); // be polite to Steam API
    const meta = await fetchAppDetails(steamAppId);

    // Skip non-game types (DLC, soundtracks, etc.) unless we have no type info
    if (meta?.type && meta.type !== 'game') return;

    const gameId = await upsertGame(steamAppId, meta);
    if (!gameId) return;

    if (meta) {
      await insertSnapshot(gameId, steamAppId, meta);
      if (meta.price_overview) {
        await updatePriceStats(gameId);
      }
    }

    stats.synced++;
    if (stats.synced % 25 === 0) {
      console.log(`[steam-sync] Progress: ${stats.synced} games upserted…`);
    }
  } catch (err) {
    console.error(`[steam-sync] ✗ appid ${steamAppId}:`, err.message);
    stats.errors.push(`${steamAppId}: ${err.message}`);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  const startedAt = new Date();
  const seen = new Set();
  const stats = { synced: 0, errors: [] };

  console.log('[steam-sync] Starting Steam Store catalog sync…');

  // 1) Featured categories (fast — no pagination)
  console.log('[steam-sync] Fetching featured categories…');
  const featuredIds = await fetchFeaturedCategories();
  console.log(`[steam-sync] Featured: ${featuredIds.length} app IDs`);
  for (const appId of featuredIds) {
    await processApp(appId, seen, stats);
  }

  // 2) Search results across multiple categories and pages
  for (const { label, params } of SEARCH_CATEGORIES) {
    console.log(`[steam-sync] Fetching search category: ${label}…`);
    for (let page = 0; page < SEARCH_PAGES; page++) {
      const items = await fetchSearchPage(params, page);
      if (items.length === 0) break;

      console.log(`[steam-sync] ${label} page ${page}: ${items.length} items`);
      for (const item of items) {
        await processApp(item.appid, seen, stats);
      }

      await sleep(500); // pause between pages
    }
  }

  // 3) Refresh materialized view
  try {
    await db.query('SELECT refresh_current_deals()');
    console.log('[steam-sync] Materialized view refreshed');
  } catch (err) {
    console.error('[steam-sync] Failed to refresh view:', err.message);
    stats.errors.push(`refresh_view: ${err.message}`);
  }

  // 4) Log result
  const status = stats.errors.length === 0
    ? 'success'
    : stats.synced > 0 ? 'partial' : 'failed';

  try {
    await db.query(
      `INSERT INTO sync_log (job_name, status, games_synced, errors, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      ['steam_store_catalog', status, stats.synced, JSON.stringify(stats.errors), startedAt]
    );
  } catch (err) {
    console.error('[steam-sync] Failed to write sync_log:', err.message);
  }

  console.log(
    `[steam-sync] Done — ${stats.synced} games upserted, ` +
    `${seen.size} unique app IDs seen, ${stats.errors.length} errors (${status})`
  );
  process.exit(0);
}

run().catch((err) => {
  console.error('[steam-sync] Unhandled error:', err);
  process.exit(1);
});
