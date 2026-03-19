/**
 * resellers.js — VaultDeal key reseller aggregator
 *
 * Fetches marketplace listings from G2A and Kinguin for a given game.
 * Returns top 3 sellers per site, filterable by rating and listing type.
 *
 * Required env vars:
 *   G2A_CLIENT_ID + G2A_CLIENT_SECRET  — https://developers.g2a.com
 *   KINGUIN_API_KEY                    — https://www.kinguin.net/partner
 *
 * Routes degrade gracefully when API keys are absent.
 */

const { Router } = require('express');
const https = require('https');
const config = require('../config');
const db = require('../db');

const router = Router();

// ─── http helpers ─────────────────────────────────────────────────────────────

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', body, headers = {} } = options;
    const parsed = new URL(url);
    const bodyStr = body
      ? typeof body === 'string'
        ? body
        : JSON.stringify(body)
      : null;

    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'User-Agent': 'VaultDeal/1.0',
        Accept: 'application/json',
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      timeout: 10000,
    };

    const req = https.request(reqOptions, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: null, raw });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', function () {
      this.destroy(new Error('Reseller API request timed out'));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── G2A ─────────────────────────────────────────────────────────────────────

let g2aTokenCache = null;
let g2aTokenExpiry = 0;

async function getG2AToken() {
  if (g2aTokenCache && Date.now() < g2aTokenExpiry) return g2aTokenCache;
  if (!config.g2aClientId || !config.g2aClientSecret) return null;

  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(config.g2aClientId)}&client_secret=${encodeURIComponent(config.g2aClientSecret)}`;

  const { data } = await httpRequest(
    'https://www.g2a.com/integration/v1/authorization/token',
    {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  if (data?.access_token) {
    g2aTokenCache = data.access_token;
    g2aTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60_000;
    return g2aTokenCache;
  }
  return null;
}

async function fetchG2AListings(gameTitle, steamAppId, opts) {
  const { includeAccounts = false, minRating = 0, limit = 3 } = opts;

  if (!config.g2aClientId || !config.g2aClientSecret) {
    return {
      available: false,
      configured: false,
      reason:
        'G2A API credentials not configured. Add G2A_CLIENT_ID and G2A_CLIENT_SECRET to your environment.',
      sellers: [],
    };
  }

  const token = await getG2AToken();
  if (!token) {
    return { available: false, configured: true, reason: 'G2A authentication failed', sellers: [] };
  }

  // Search for matching product
  const searchQuery = steamAppId
    ? `appid:${steamAppId} OR ${gameTitle}`
    : gameTitle;
  const { data: searchData, status: searchStatus } = await httpRequest(
    `https://www.g2a.com/integration/public/v1/products?search=${encodeURIComponent(gameTitle)}&platform=steam`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (searchStatus !== 200 || !searchData?.docs?.length) {
    return { available: true, configured: true, sellers: [] };
  }

  // Use the first/best matching product
  const product = searchData.docs[0];

  // Fetch individual seller auctions for that product
  const { data: auctionsData, status: auctionsStatus } = await httpRequest(
    `https://www.g2a.com/integration/public/v1/products/${product.id}/auctions`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (auctionsStatus !== 200 || !auctionsData?.auctions?.length) {
    return { available: true, configured: true, sellers: [] };
  }

  const sellers = auctionsData.auctions
    .filter((a) => {
      const type = (a.type || 'Key').toLowerCase();
      if (!includeAccounts && type === 'account') return false;
      if (minRating > 0 && (a.sellerRating || 0) < minRating) return false;
      return true;
    })
    .sort((a, b) => (a.price || 999) - (b.price || 999))
    .slice(0, limit)
    .map((a) => ({
      sellerName: a.merchantName || 'Unknown Seller',
      price: parseFloat(a.price) || 0,
      currency: (a.currency || 'USD').toUpperCase(),
      rating: a.sellerRating != null ? parseFloat(a.sellerRating) : null,
      positiveReviews: a.sellerPositiveFeedbacks ?? null,
      negativeReviews: a.sellerNegativeFeedbacks ?? null,
      type: a.type || 'Key',
      qty: a.qty ?? null,
      region: a.regionName || 'Global',
      url: product.url || `https://www.g2a.com/search?query=${encodeURIComponent(gameTitle)}`,
    }));

  return {
    available: true,
    configured: true,
    productName: product.name,
    sellers,
  };
}

// ─── Kinguin ─────────────────────────────────────────────────────────────────

async function fetchKinguinListings(gameTitle, steamAppId, opts) {
  const { includeAccounts = false, minRating = 0, limit = 3 } = opts;

  if (!config.kinguinApiKey) {
    return {
      available: false,
      configured: false,
      reason:
        'Kinguin API key not configured. Add KINGUIN_API_KEY to your environment.',
      sellers: [],
    };
  }

  // Search for the product — prefer Steam App ID match
  let searchUrl = `https://api.kinguin.net/integration/v2/products?name=${encodeURIComponent(gameTitle)}&platform=steam&sortBy=cheapest&limit=5`;
  if (steamAppId) searchUrl += `&steam=${steamAppId}`;

  const { data: searchData, status: searchStatus } = await httpRequest(searchUrl, {
    headers: { 'X-Api-Key': config.kinguinApiKey },
  });

  if (searchStatus !== 200 || !searchData?.products?.length) {
    return { available: true, configured: true, sellers: [] };
  }

  const product = searchData.products[0];

  // Fetch individual seller offers
  const { data: offersData, status: offersStatus } = await httpRequest(
    `https://api.kinguin.net/integration/v2/offers?productId=${product.productId}&sortBy=cheapest&limit=10`,
    { headers: { 'X-Api-Key': config.kinguinApiKey } }
  );

  // If no granular offers, fall back to product-level listing
  if (offersStatus !== 200 || !offersData?.offers?.length) {
    if (!includeAccounts && product.productType === 'account') {
      return { available: true, configured: true, sellers: [] };
    }
    return {
      available: true,
      configured: true,
      productName: product.name,
      sellers: [
        {
          sellerName: 'Kinguin Marketplace',
          price: parseFloat(product.price) || 0,
          currency: (product.currency || 'USD').toUpperCase(),
          rating: null,
          positiveReviews: null,
          negativeReviews: null,
          type: product.productType || 'Key',
          qty: product.qty ?? null,
          region: product.regionName || 'GLOBAL',
          url: `https://www.kinguin.net/category/${product.productId}`,
        },
      ],
    };
  }

  const sellers = offersData.offers
    .filter((o) => {
      const type = (o.productType || 'key').toLowerCase();
      if (!includeAccounts && type === 'account') return false;
      if (minRating > 0 && (o.merchantRating || 0) < minRating) return false;
      return true;
    })
    .sort((a, b) => (a.price || 999) - (b.price || 999))
    .slice(0, limit)
    .map((o) => ({
      sellerName: o.merchantName || 'Kinguin Merchant',
      price: parseFloat(o.price) || 0,
      currency: (o.currency || 'USD').toUpperCase(),
      rating: o.merchantRating != null ? parseFloat(o.merchantRating) : null,
      positiveReviews: null,
      negativeReviews: null,
      type: o.productType || 'Key',
      qty: o.qty ?? null,
      region: o.regionName || 'GLOBAL',
      url: `https://www.kinguin.net/category/${product.productId}`,
    }));

  return {
    available: true,
    configured: true,
    productName: product.name,
    sellers,
  };
}

// ─── GET /api/resellers/:gameId ───────────────────────────────────────────────
// Query params:
//   sites         — comma-separated: "g2a,kinguin" (default: both)
//   includeAccounts — "true" to include account listings (default: false)
//   minRating     — float 0–5, minimum seller rating (default: 0)
router.get('/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const {
      sites = 'g2a,kinguin',
      includeAccounts = 'false',
      minRating = '0',
    } = req.query;

    const opts = {
      includeAccounts: includeAccounts === 'true',
      minRating: Math.max(0, Math.min(5, parseFloat(minRating) || 0)),
      limit: 3,
    };

    const requestedSites = sites
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // Look up the game
    const { rows } = await db.query(
      'SELECT id, title, steam_app_id FROM games WHERE id = $1',
      [parseInt(gameId)]
    );

    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    const game = rows[0];

    // Fetch from each requested site in parallel
    const results = {};
    const fetches = [];

    if (requestedSites.includes('g2a')) {
      fetches.push(
        fetchG2AListings(game.title, game.steam_app_id, opts)
          .then((d) => { results.g2a = d; })
          .catch((err) => { results.g2a = { available: false, configured: true, reason: err.message, sellers: [] }; })
      );
    }

    if (requestedSites.includes('kinguin')) {
      fetches.push(
        fetchKinguinListings(game.title, game.steam_app_id, opts)
          .then((d) => { results.kinguin = d; })
          .catch((err) => { results.kinguin = { available: false, configured: true, reason: err.message, sellers: [] }; })
      );
    }

    await Promise.all(fetches);

    res.json({
      gameId: game.id,
      title: game.title,
      steamAppId: game.steam_app_id,
      resellers: results,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
