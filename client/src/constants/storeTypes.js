export const OFFICIAL_STORES = new Set(['steam', 'epic']);

export const KEY_RESELLERS = new Set([
  'g2a', 'kinguin', 'fanatical', 'greenmangaming', 'gmg',
  'humble', 'humblestore', 'gog', 'gamersgate', 'wingamestore',
  'indiegala', 'gamebillet', 'voidu', 'dlgamer',
]);

// Any store not in OFFICIAL_STORES is treated as a reseller
// (safe default — better to over-warn than under-warn)
export function classifyStore(storeName) {
  const s = (storeName || '').toLowerCase().replace(/\s/g, '');
  if (OFFICIAL_STORES.has(s)) return 'official';
  return 'reseller';
}
