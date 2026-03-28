/**
 * auth.js — Steam OpenID authentication routes
 *
 * Implements Steam OpenID 2.0 without passport or express-session.
 * Uses JWT stored in client localStorage — stateless, works on Render free tier.
 *
 * Flow:
 *   1. GET /api/auth/steam          — redirect user to Steam login page
 *   2. GET /api/auth/steam/return   — Steam calls back here after login
 *   3. Server verifies OpenID, upserts user, issues JWT
 *   4. Redirect to CLIENT_URL/auth/callback#token=JWT
 *   5. Frontend reads token, stores in localStorage
 *
 * Required env vars:
 *   STEAM_API_KEY  — for fetching profile name/avatar after auth
 *   JWT_SECRET     — for signing tokens
 *   APP_BASE_URL   — server's public URL (e.g. https://vaultdeal-app.onrender.com)
 *   CLIENT_URL     — frontend URL (same as APP_BASE_URL in production, http://localhost:5173 in dev)
 */

const { Router } = require('express');
const https = require('https');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

const router = Router();

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

// ─── helpers ──────────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET',
        headers: { 'User-Agent': 'VaultDeal/1.0' }, timeout: 8000 },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      }
    ).on('error', reject).on('timeout', function () { this.destroy(); }).end();
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const req = https.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'POST',
        headers: { 'User-Agent': 'VaultDeal/1.0', 'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bodyStr) }, timeout: 8000 },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      }
    );
    req.on('error', reject).on('timeout', function () { this.destroy(); });
    req.write(bodyStr);
    req.end();
  });
}

function tryParseJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return `${forwardedProto}://${req.get('host')}`;
}

function getAppBaseUrl(req) {
  if (config.nodeEnv === 'production') {
    return trimTrailingSlash(getRequestOrigin(req));
  }
  return trimTrailingSlash(config.appBaseUrl || getRequestOrigin(req));
}

function getClientUrl(req) {
  if (config.nodeEnv === 'production') {
    if (config.clientUrl && !config.clientUrl.includes('localhost')) {
      return trimTrailingSlash(config.clientUrl);
    }
    return trimTrailingSlash(getRequestOrigin(req));
  }
  return trimTrailingSlash(config.clientUrl || getRequestOrigin(req));
}

// ─── GET /api/auth/steam ──────────────────────────────────────────────────────
// Redirects user to Steam's OpenID login page
router.get('/steam', (req, res) => {
  const appBaseUrl = getAppBaseUrl(req);
  const returnUrl = `${appBaseUrl}/api/auth/steam/return`;
  const params = new URLSearchParams({
    'openid.ns':         'http://specs.openid.net/auth/2.0',
    'openid.mode':       'checkid_setup',
    'openid.return_to':  returnUrl,
    'openid.realm':      appBaseUrl,
    'openid.identity':   'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  res.redirect(`${STEAM_OPENID_URL}?${params}`);
});

// ─── GET /api/auth/steam/return ───────────────────────────────────────────────
// Steam redirects here after the user logs in
router.get('/steam/return', async (req, res) => {
  try {
    const clientUrl = getClientUrl(req);

    // ── 1. Verify the OpenID assertion with Steam ──────────────────────────
    const verifyParams = { ...req.query, 'openid.mode': 'check_authentication' };
    const { raw: verifyRaw } = await httpsPost(STEAM_OPENID_URL, verifyParams);

    if (!verifyRaw.includes('is_valid:true')) {
      return res.redirect(`${clientUrl}/auth/callback?error=invalid_assertion`);
    }

    // ── 2. Extract Steam ID from claimed_id ────────────────────────────────
    const claimedId = req.query['openid.claimed_id'] || '';
    const steamIdMatch = claimedId.match(/\/openid\/id\/(\d{17})$/);
    if (!steamIdMatch) {
      return res.redirect(`${clientUrl}/auth/callback?error=no_steam_id`);
    }
    const steamId = steamIdMatch[1];

    // ── 3. Fetch Steam profile (name + avatar) ─────────────────────────────
    let personaName = `Steam User`;
    let avatarUrl = null;

    if (config.steamApiKey) {
      try {
        const profileUrl =
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/` +
          `?key=${config.steamApiKey}&steamids=${steamId}`;
        const { raw: profileRaw } = await httpsGet(profileUrl);
        const profileData = tryParseJson(profileRaw);
        const player = profileData?.response?.players?.[0];
        if (player) {
          personaName = player.personaname || personaName;
          avatarUrl = player.avatarfull || player.avatarmedium || player.avatar || null;
        }
      } catch { /* non-fatal — proceed with default name */ }
    } else {
      // Fallback: get display name from community XML
      try {
        const xmlUrl = `https://steamcommunity.com/profiles/${steamId}/?xml=1`;
        const { raw: xmlRaw } = await httpsGet(xmlUrl);
        const nameMatch = xmlRaw.match(/<steamID><!\[CDATA\[(.+?)\]\]><\/steamID>/);
        const avatarMatch = xmlRaw.match(/<avatarFull><!\[CDATA\[(.+?)\]\]><\/avatarFull>/);
        if (nameMatch) personaName = nameMatch[1];
        if (avatarMatch) avatarUrl = avatarMatch[1];
      } catch { /* non-fatal */ }
    }

    // ── 4. Upsert user in database ─────────────────────────────────────────
    const { rows } = await db.query(
      `INSERT INTO users (steam_id, steam_display_name, steam_avatar_url, last_login_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (steam_id) DO UPDATE SET
         steam_display_name = EXCLUDED.steam_display_name,
         steam_avatar_url   = EXCLUDED.steam_avatar_url,
         last_login_at      = NOW()
       RETURNING id`,
      [steamId, personaName, avatarUrl]
    );
    const userId = rows[0].id;

    // ── 5. Issue JWT (30 day expiry) ───────────────────────────────────────
    const token = jwt.sign(
      { userId, steamId, personaName, avatarUrl },
      config.jwtSecret,
      { expiresIn: '30d' }
    );

    // ── 6. Redirect frontend with token in URL hash ────────────────────────
    res.redirect(`${clientUrl}/auth/callback#token=${token}`);
  } catch (err) {
    console.error('[auth] Steam callback error:', err.message);
    res.redirect(`${getClientUrl(req)}/auth/callback?error=server_error`);
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Returns the current user from their JWT — used to restore session on page load
router.get('/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.json({ user: null });
  try {
    const user = jwt.verify(token, config.jwtSecret);
    res.json({ user: { userId: user.userId, steamId: user.steamId, personaName: user.personaName, avatarUrl: user.avatarUrl } });
  } catch {
    res.json({ user: null });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Stateless — client just discards the token. This endpoint is a no-op but
// exists so the frontend has a clean logout URL to call.
router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

module.exports = router;
