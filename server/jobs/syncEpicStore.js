/**
 * syncEpicStore.js — VaultDeal Epic Games Store sync job
 *
 * Fetches currently free and on-sale games from Epic Games Store,
 * matches them to existing games rows (by epic_slug or title),
 * upserts price_snapshots with store='epic', then refreshes
 * the materialized view.
 *
 * Note: Epic-only games (no Steam match) are skipped because
 * steam_app_id is NOT NULL in the games table. Skipped titles
 * are logged to sync_log.errors for manual review.
 *
 * Run manually:  node server/jobs/syncEpicStore.js
 * Run via cron:  configured in render.yaml (every 6 hours)
 */

require('dotenv').config();

const https = require('https');
const db = require('../src/db');

const FREE_GAMES_URL =
  'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';
const GRAPHQL_URL = 'https://store.epicgames.com/graphql';
const PAGE_SIZE = 40;

// ─── helpers ────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 15000 }, (res) => {
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

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Mozilla/5.0',
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`JSON parse error for POST ${url}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function () { this.destroy(new Error(`Timeout: POST ${url}`)); });
    req.write(payload);
    req.end();
  });
}

function epicDealUrl(productSlug) {
  if (!productSlug) return null;
  return `https://store.epicgames.com/en-US/p/${productSlug}`;
}

function getPromoWindow(el) {
  const currentOffer = el.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
  const upcomingOffer = el.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0];
  return currentOffer || upcomingOffer || null;
}

// ─── fetch free games ────────────────────────────────────────────────────────

async function fetchFreeGames() {
  const data = await fetchJson(FREE_GAMES_URL);
  const elements = data?.data?.Catalog?.searchStore?.elements ?? [];
  return elements.filter((el) => {
    if (!el.productSlug) return false;
    const offers = el.promotions?.promotionalOffers ?? [];
    return offers.some((o) => o.promotionalOffers?.length > 0);
  });
}

// ─── fetch on-sale games via GraphQL ────────────────────────────────────────

function buildGraphqlQuery(start = 0) {
  return {
    query: `{
      Catalog {
        searchStore(
          allowCountries: "US"
          count: ${PAGE_SIZE}
          start: ${start}
          country: "US"
          locale: "en-US"
          onSale: true
          sortBy: "currentPrice"
          sortDir: "ASC"
          category: "games/edition/base"
        ) {
          elements {
            title
            id
            namespace
            productSlug
            keyImages { type url }
            price(country: "US") {
              totalPrice {
                discountPrice
                originalPrice
                discount
                currencyCode
              }
            }
            promotions(category: "games/edition/base") {
              promotionalOffers {
                promotionalOffers {
                  startDate endDate
                  discountSetting { discountType discountPercentage }
                }
              }
            }
          }
          paging { count total }
        }
      }
    }`,
  };
}

async function fetchOnSaleGames() {
  const allElements = [];
  let start = 0;
  let total = null;

  try {
    do {
      const result = await postJson(GRAPHQL_URL, buildGraphqlQuery(start));
      const searchStore = result?.data?.Catalog?.searchStore;
      if (!searchStore) break;

      const elements = searchStore.elements ?? [];
      allElements.push(...elements);

      if (total === null) total = searchStore.paging?.total ?? elements.length;
      start += elements.length;

      if (elements.length === 0) break;
    } while (start < total && start < 200); // cap at 200 to avoid runaway loops
  } catch (err) {
    console.error('[epic-sync] GraphQL fetch failed (non-fatal):', err.message);
    // Return whatever we got — free games endpoint is the reliable fallback
  }

  return allElements.filter((el) => el.productSlug);
}

// ─── game matching ───────────────────────────────────────────────────────────

async function findGameId(epicSlug, title) {
  // 1. Match by epic_slug
  if (epicSlug) {
    const { rows } = await db.query(
      'SELECT id FROM games WHERE epic_slug = $1 LIMIT 1',
      [epicSlug]
    );
    if (rows.length) return rows[0].id;
  }

  // 2. Case-insensitive title match
  const { rows } = await db.query(
    'SELECT id FROM games WHERE LOWER(title) = LOWER($1) LIMIT 1',
    [title]
  );
  if (rows.length) {
    // Opportunistically save the epic_slug for future lookups
    if (epicSlug) {
      await db.query('UPDATE games SET epic_slug = $1 WHERE id = $2', [epicSlug, rows[0].id]);
    }
    return rows[0].id;
  }

  return null;
}

// ─── upsert price snapshot ───────────────────────────────────────────────────

async function upsertSnapshot(gameId, el) {
  const price = el.price?.totalPrice;
  if (!price) return;

  const priceCurrent = price.discountPrice / 100;
  const priceRegular = price.originalPrice / 100;
  const discount = price.discount ?? 0;
  const discountPct =
    priceRegular > 0 ? Math.round((discount / price.originalPrice) * 100) : 0;
  const promoWindow = getPromoWindow(el);
  const isFreePromo = priceCurrent === 0 && priceRegular > 0;
  const isOnSale = isFreePromo || priceCurrent < priceRegular;
  const dealUrl = epicDealUrl(el.productSlug);
  const promoType = isFreePromo ? 'free' : isOnSale ? 'sale' : 'standard';
  const promoLabel = isFreePromo ? 'Free on Epic' : isOnSale ? 'Epic sale' : 'Epic price';

  await db.query(
    `INSERT INTO price_snapshots
       (game_id, store, store_type, price_current, price_regular, discount_pct, is_on_sale, promo_type, promo_label, promo_starts_at, promo_ends_at, sale_ends_at, deal_url)
     VALUES ($1, 'epic', 'official', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      gameId,
      priceCurrent,
      priceRegular,
      discountPct,
      isOnSale,
      promoType,
      promoLabel,
      promoWindow?.startDate || null,
      promoWindow?.endDate || null,
      !isFreePromo ? promoWindow?.endDate || null : null,
      dealUrl,
    ]
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  const startedAt = new Date();
  let gamesSync = 0;
  const errors = [];
  const skipped = [];
  const seen = new Set();

  console.log('[epic-sync] Starting Epic Games Store sync…');

  // Fetch both sources
  let freeGames = [];
  let onSaleGames = [];

  try {
    freeGames = await fetchFreeGames();
    console.log(`[epic-sync] Free games: ${freeGames.length}`);
  } catch (err) {
    console.error('[epic-sync] Failed to fetch free games:', err.message);
    errors.push(`free_games: ${err.message}`);
  }

  try {
    onSaleGames = await fetchOnSaleGames();
    console.log(`[epic-sync] On-sale games: ${onSaleGames.length}`);
  } catch (err) {
    console.error('[epic-sync] Failed to fetch on-sale games:', err.message);
    errors.push(`on_sale_games: ${err.message}`);
  }

  // Merge and deduplicate by Epic internal id
  const allGames = [...freeGames, ...onSaleGames].filter((el) => {
    if (!el.id || seen.has(el.id)) return false;
    seen.add(el.id);
    return true;
  });

  console.log(`[epic-sync] Total unique games to process: ${allGames.length}`);

  for (const el of allGames) {
    const title = el.title;
    const epicSlug = el.productSlug;

    try {
      const gameId = await findGameId(epicSlug, title);

      if (!gameId) {
        skipped.push(title);
        console.log(`[epic-sync] ~ Skipped (no DB match): ${title}`);
        continue;
      }

      await upsertSnapshot(gameId, el);
      gamesSync++;
      console.log(`[epic-sync] ✓ ${title}`);
    } catch (err) {
      console.error(`[epic-sync] ✗ ${title}:`, err.message);
      errors.push(`${title}: ${err.message}`);
    }
  }

  // Refresh materialized view
  try {
    await db.query('SELECT refresh_current_deals()');
    console.log('[epic-sync] Materialized view refreshed');
  } catch (err) {
    console.error('[epic-sync] Failed to refresh view:', err.message);
    errors.push(`refresh_view: ${err.message}`);
  }

  const allErrors = [
    ...errors,
    ...(skipped.length ? [`skipped_no_match(${skipped.length}): ${skipped.slice(0, 10).join(', ')}`] : []),
  ];

  const status = errors.length === 0 ? 'success' : gamesSync > 0 ? 'partial' : 'failed';
  await logSync('epic_store', status, gamesSync, allErrors, startedAt);

  console.log(
    `[epic-sync] Done — ${gamesSync} synced, ${skipped.length} skipped (no DB match), ${errors.length} errors (${status})`
  );
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
    console.error('[epic-sync] Failed to write sync_log:', err.message);
  }
}

run().catch((err) => {
  console.error('[epic-sync] Unhandled error:', err);
  process.exit(1);
});
