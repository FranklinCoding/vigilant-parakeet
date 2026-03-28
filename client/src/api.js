const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export function getDeals(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return request(`/deals${qs ? `?${qs}` : ''}`);
}

export function getDiscoveryHome(params = {}) {
  const qs = new URLSearchParams();
  if (params.owned?.length) qs.set('owned', params.owned.join(','));
  if (params.likes?.length) qs.set('likes', params.likes.join(','));
  if (params.dislikes?.length) qs.set('dislikes', params.dislikes.join(','));
  if (params.recentTags?.length) qs.set('recentTags', params.recentTags.join(','));
  return request(`/discovery/home${qs.toString() ? `?${qs}` : ''}`);
}

export function getRecommendations(payload = {}) {
  return request('/recommendations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getDeal(gameId) {
  return request(`/deals/${gameId}`);
}

export function getGame(steamAppId) {
  return request(`/games/${steamAppId}`);
}

// ─── Steam Profile ────────────────────────────────────────────────────────────

export function resolveSteamUrl(url) {
  return request(`/steam/resolve?url=${encodeURIComponent(url)}`);
}

export function getSteamProfile(steamId) {
  return request(`/steam/profile/${steamId}`);
}

export function getSteamLibrary(steamId) {
  return request(`/steam/library/${steamId}`);
}

export function getSteamRecent(steamId) {
  return request(`/steam/recent/${steamId}`);
}

export function getSteamReplay(steamId, year) {
  return request(`/steam/replay/${steamId}/${year}`);
}

export function getAuthMe(token) {
  return request('/auth/me', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function getEpicAccountStatus() {
  return request('/accounts/epic/status');
}

// ─── Resellers ────────────────────────────────────────────────────────────────

export function getResellers(gameId, params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return request(`/resellers/${gameId}${qs ? `?${qs}` : ''}`);
}
