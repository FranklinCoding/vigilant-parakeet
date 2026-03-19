/**
 * steam.js — VaultDeal Steam profile proxy routes
 *
 * Proxies calls to Steam Web API and Steam Community endpoints.
 * All data is fetched on-demand; nothing is persisted server-side
 * (clients store the resolved steamId in localStorage).
 *
 * Required env var: STEAM_API_KEY (https://steamcommunity.com/dev/apikey)
 * Vanity URL resolution and Year-in-Review work without a key for public profiles.
 */

const { Router } = require('express');
const https = require('https');
const config = require('../config');

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function httpGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'VaultDeal/1.0',
        Accept: 'application/json, text/xml, */*',
        ...extraHeaders,
      },
      timeout: 8000,
    };
    https
      .request(options, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      })
      .on('error', reject)
      .on('timeout', function () {
        this.destroy(new Error('Steam API request timed out'));
      })
      .end();
  });
}

function httpPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'User-Agent': 'VaultDeal/1.0',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Accept: 'application/json',
        ...extraHeaders,
      },
      timeout: 8000,
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, raw }));
    });
    req.on('error', reject);
    req.on('timeout', function () {
      this.destroy(new Error('Steam API request timed out'));
    });
    req.write(bodyStr);
    req.end();
  });
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── GET /api/steam/resolve?url=... ─────────────────────────────────────────
// Resolves a Steam profile URL to a Steam64 ID.
// Handles: /profiles/STEAMID64, /id/VANITYURL, or bare STEAMID64
router.get('/resolve', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url query parameter is required' });
    }

    let steamId = null;

    // Direct Steam64 ID (17-digit number, optionally pasted as-is)
    const bareId = url.trim().match(/^(\d{17})$/);
    if (bareId) {
      steamId = bareId[1];
    }

    // /profiles/STEAMID64
    if (!steamId) {
      const profileMatch = url.match(/\/profiles\/(\d{17})/);
      if (profileMatch) steamId = profileMatch[1];
    }

    // /id/VANITYURL
    if (!steamId) {
      const vanityMatch = url.match(/\/id\/([^/?#]+)/);
      if (vanityMatch) {
        const vanity = vanityMatch[1];
        if (config.steamApiKey) {
          const apiUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${config.steamApiKey}&vanityurl=${encodeURIComponent(vanity)}`;
          const { raw } = await httpGet(apiUrl);
          const data = tryParseJson(raw);
          if (data?.response?.success === 1) steamId = data.response.steamid;
        }

        if (!steamId) {
          // Fallback: Steam community XML (no API key required)
          const xmlUrl = `https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`;
          const { raw } = await httpGet(xmlUrl);
          const match = raw.match(/<steamID64>(\d+)<\/steamID64>/);
          if (match) steamId = match[1];
        }
      }
    }

    if (!steamId) {
      return res.status(404).json({
        error:
          'Could not resolve a Steam ID from the provided URL. Make sure it is a valid steamcommunity.com profile link.',
      });
    }

    res.json({ steamId });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/steam/profile/:steamId ────────────────────────────────────────
// Returns basic player summary (name, avatar, visibility).
router.get('/profile/:steamId', async (req, res, next) => {
  try {
    const { steamId } = req.params;

    if (!config.steamApiKey) {
      return res.json({
        steamId,
        limited: true,
        message:
          'Steam API key not configured. Add STEAM_API_KEY to your .env to see full profile details.',
      });
    }

    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${config.steamApiKey}&steamids=${steamId}`;
    const { raw, status } = await httpGet(url);

    if (status !== 200) {
      return res.status(502).json({ error: 'Steam API returned an error' });
    }

    const data = tryParseJson(raw);
    const player = data?.response?.players?.[0];

    if (!player) {
      return res
        .status(404)
        .json({ error: 'Steam profile not found or is private' });
    }

    res.json({
      steamId: player.steamid,
      personaName: player.personaname,
      avatarUrl: player.avatarfull || player.avatarmedium || player.avatar,
      profileUrl: player.profileurl,
      // communityvisibilitystate: 1=private, 2=friends only, 3=public
      isPublic: player.communityvisibilitystate === 3,
      lastOnline: player.lastlogoff
        ? new Date(player.lastlogoff * 1000).toISOString()
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/steam/library/:steamId ────────────────────────────────────────
// Returns owned games sorted by all-time playtime descending.
router.get('/library/:steamId', async (req, res, next) => {
  try {
    const { steamId } = req.params;

    if (!config.steamApiKey) {
      return res.json({
        games: [],
        totalGames: 0,
        totalPlaytimeMins: 0,
        limited: true,
        message:
          'A Steam API key is required to view your library. Add STEAM_API_KEY to your .env file. ' +
          'Get a free key at https://steamcommunity.com/dev/apikey',
      });
    }

    const url =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
      `?key=${config.steamApiKey}&steamid=${steamId}` +
      `&include_appinfo=true&include_played_free_games=true`;

    const { raw, status } = await httpGet(url);

    if (status !== 200) {
      return res.status(502).json({ error: 'Steam API returned an error fetching library' });
    }

    const data = tryParseJson(raw);

    if (!data?.response?.games) {
      return res.json({
        games: [],
        totalGames: 0,
        totalPlaytimeMins: 0,
        limited: true,
        message:
          'Library is private or empty. Make sure your Steam library is set to public.',
      });
    }

    const games = data.response.games
      .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
      .map((g) => ({
        appId: g.appid,
        name: g.name,
        playtimeMins: g.playtime_forever || 0,
        playtime2WeeksMins: g.playtime_2weeks || 0,
        iconUrl: g.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
          : null,
        lastPlayed: g.rtime_last_played
          ? new Date(g.rtime_last_played * 1000).toISOString()
          : null,
      }));

    res.json({
      games,
      totalGames: games.length,
      totalPlaytimeMins: games.reduce((s, g) => s + g.playtimeMins, 0),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/steam/recent/:steamId ─────────────────────────────────────────
// Returns games played in the last 2 weeks.
router.get('/recent/:steamId', async (req, res, next) => {
  try {
    const { steamId } = req.params;

    if (!config.steamApiKey) {
      return res.json({
        games: [],
        limited: true,
        message: 'Steam API key required to fetch recently played games.',
      });
    }

    const url =
      `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/` +
      `?key=${config.steamApiKey}&steamid=${steamId}&count=20`;

    const { raw, status } = await httpGet(url);

    if (status !== 200) {
      return res.json({ games: [], limited: true });
    }

    const data = tryParseJson(raw);
    const games = (data?.response?.games || []).map((g) => ({
      appId: g.appid,
      name: g.name,
      playtime2WeeksMins: g.playtime_2weeks || 0,
      playtimeForeverMins: g.playtime_forever || 0,
      iconUrl: g.img_icon_url
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
        : null,
      headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
    }));

    res.json({ games });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/steam/replay/:steamId/:year ────────────────────────────────────
// Attempts to fetch Steam Year in Review data for a given year.
// Works for public profiles. Returns null replay if private/unavailable.
router.get('/replay/:steamId/:year', async (req, res, next) => {
  try {
    const { steamId } = req.params;
    const year = parseInt(req.params.year);

    if (isNaN(year) || year < 2022 || year > 2026) {
      return res.status(400).json({ error: 'Year must be between 2022 and 2026' });
    }

    // Steam Replay RPC endpoint (works for public profiles without login)
    let replayData = null;
    try {
      const { raw, status } = await httpPost(
        'https://store.steampowered.com/replay/rpc/GetReplaySummary',
        { steam_id: steamId, year },
        { 'Content-Type': 'application/json' }
      );

      if (status === 200) {
        const parsed = tryParseJson(raw);
        if (parsed && !parsed.error) {
          replayData = parsed;
        }
      }
    } catch {
      // Replay endpoint unavailable — non-fatal
    }

    res.json({
      year,
      replay: replayData,
      available: replayData !== null,
      message: replayData
        ? null
        : 'Year in Review is private or has not been generated for this account yet.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
