const BASE = '/api';

async function request(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getDeals(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return request(`/deals${qs ? `?${qs}` : ''}`);
}

export function getDeal(gameId) {
  return request(`/deals/${gameId}`);
}

export function getGame(steamAppId) {
  return request(`/games/${steamAppId}`);
}
