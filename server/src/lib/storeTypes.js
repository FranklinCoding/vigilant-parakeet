const OFFICIAL_STORES = new Set(['steam', 'epic']);

function normalizeStore(store) {
  return String(store || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function classifyStore(store) {
  return OFFICIAL_STORES.has(normalizeStore(store)) ? 'official' : 'reseller';
}

module.exports = {
  OFFICIAL_STORES,
  normalizeStore,
  classifyStore,
};
