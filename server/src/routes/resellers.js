/**
 * resellers.js — VaultDeal price comparison via IsThereAnyDeal API
 *
 * Uses ITAD to fetch current prices for a game across 30+ stores
 * including Fanatical, GreenManGaming, Humble, GamersGate, GOG, and more.
 *
 * Required env var: ITAD_API_KEY (free at https://isthereanydeal.com/dev/app/)
 *
 * ITAD API v2 docs: https://docs.isthereanydeal.com/
 */

const { Router } = require('express');
const https = require('https');
const config = require('../config');
const db = require('../db');

const router = Router();

const ITAD_BASE = 'https://api.isthereanydeal.com';

// ─── http helpers ─────────────────────────────────────────────────────────────

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'VaultDeal/1.0', Accept: 'application/json', ...headers },
      timeout: 10000,
    };
    https.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: null }); }
      });
    })
    .on('error', reject)
    .on('timeout', function () { this.destroy(new Error('ITAD request timed out')); })
    .end();
  });
}

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = JSON.stringify(body);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'User-Agent': 'VaultDeal/1.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
      timeout: 10000,
    };
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function () { this.destroy(new Error('ITAD request timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

// ─── ITAD helpers ─────────────────────────────────────────────────────────────

// Step 1: Resolve a Steam App ID to an ITAD game ID
async function lookupItadId(steamAppId, key) {
  const url = `${ITAD_BASE}/games/lookup/v1?key=${key}&appid=${steamAppId}`;
  const { status, data } = await httpGet(url);
  if (status !== 200 || !data?.game?.id) return null;
  return data.game.id;
}

// Step 2: Get current prices for an ITAD game ID across all stores
async function getPrices(itadId, key, country = 'US') {
  const url = `${ITAD_BASE}/games/prices/v2?key=${key}&country=${country}&deals=1`;
  const { status, data } = await httpPost(url, [itadId]);
  if (status !== 200 || !Array.isArray(data) || !data.length) return [];
  return data[0]?.deals || [];
}

// Step 3: Get historical low prices for context
async function getHistoryLow(itadId, key, country = 'US') {
  const url = `${ITAD_BASE}/games/historylow/v1?key=${key}&country=${country}`;
  const { status, data } = await httpPost(url, [itadId]);
  if (status !== 200 || !Array.isArray(data) || !data.length) return null;
  const entry = data[0];
  if (!entry?.low) return null;
  return {
    price: entry.low.amount,
    currency: entry.low.currency,
    shop: entry.low.shop?.name || null,
    date: entry.low.timestamp || null,
  };
}

// ─── GET /api/resellers/:gameId ───────────────────────────────────────────────
// Query params:
//   country    — ISO country code for pricing (default: US)
//   minCut     — minimum discount % to include (default: 0)
//   limit      — max deals to return (default: 10)
router.get('/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { country = 'US', minCut = '0', limit = '10' } = req.query;

    if (!config.itadApiKey) {
      return res.json({
        configured: false,
        message:
          'IsThereAnyDeal API key not configured. Add ITAD_API_KEY to your .env file. ' +
          'Get a free key at https://isthereanydeal.com/dev/app/',
        deals: [],
        historyLow: null,
      });
    }

    // Look up the game in our DB
    const { rows } = await db.query(
      'SELECT id, title, steam_app_id FROM games WHERE id = $1',
      [parseInt(gameId)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    const game = rows[0];

    if (!game.steam_app_id) {
      return res.json({ configured: true, deals: [], historyLow: null, message: 'No Steam App ID for this game.' });
    }

    // Resolve to ITAD ID
    const itadId = await lookupItadId(game.steam_app_id, config.itadApiKey);
    if (!itadId) {
      return res.json({
        configured: true,
        deals: [],
        historyLow: null,
        message: 'Game not found in IsThereAnyDeal database.',
      });
    }

    // Fetch prices and history low in parallel
    const [rawDeals, historyLow] = await Promise.all([
      getPrices(itadId, config.itadApiKey, country),
      getHistoryLow(itadId, config.itadApiKey, country),
    ]);

    const cutThreshold = parseInt(minCut) || 0;
    const maxResults = Math.min(parseInt(limit) || 10, 30);

    const deals = rawDeals
      .filter((d) => (d.cut || 0) >= cutThreshold)
      .sort((a, b) => (a.price?.amount || 999) - (b.price?.amount || 999))
      .slice(0, maxResults)
      .map((d) => ({
        store: d.shop?.name || 'Unknown Store',
        storeId: d.shop?.id || null,
        price: d.price?.amount ?? null,
        regular: d.regular?.amount ?? null,
        cut: d.cut || 0,
        currency: d.price?.currency || 'USD',
        storeLow: d.storeLow?.amount ?? null,
        voucher: d.voucher || null,
        drm: d.drm || [],
        url: d.url || null,
        expiry: d.expiry || null,
      }));

    res.json({
      configured: true,
      gameId: game.id,
      title: game.title,
      steamAppId: game.steam_app_id,
      itadId,
      deals,
      historyLow,
      country,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
