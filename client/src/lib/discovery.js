const QUICK_PICKS_KEY = 'vaultdeal_quick_picks';

export function getQuickPicks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUICK_PICKS_KEY) || '{}');
    return {
      likedTags: Array.isArray(parsed.likedTags) ? parsed.likedTags : [],
      dislikedTags: Array.isArray(parsed.dislikedTags) ? parsed.dislikedTags : [],
    };
  } catch {
    return { likedTags: [], dislikedTags: [] };
  }
}

export function saveQuickPicks(nextValue) {
  localStorage.setItem(QUICK_PICKS_KEY, JSON.stringify(nextValue));
}

export function getStoredSteamLibrary() {
  try {
    const profile = JSON.parse(localStorage.getItem('vaultdeal_steam_profile') || 'null');
    const steamId = profile?.steamId;
    if (!steamId) return null;
    return JSON.parse(localStorage.getItem(`vaultdeal_library_${steamId}`) || 'null');
  } catch {
    return null;
  }
}

export function buildDiscoveryQuery() {
  const library = getStoredSteamLibrary();
  const owned = (library?.games || []).map((game) => game.appId).filter(Boolean);
  const recent = (library?.games || []).slice(0, 8).flatMap((game) => game.tags || []);
  const quickPicks = getQuickPicks();

  return {
    owned,
    likes: quickPicks.likedTags,
    dislikes: quickPicks.dislikedTags,
    recentTags: [...new Set(recent)],
  };
}

export function formatCountdown(target) {
  if (!target) return null;
  const diff = new Date(target).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 'Ends soon';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days >= 2) return `${days} days left`;
  if (hours >= 24) return '1 day left';
  if (hours >= 2) return `${hours} hours left`;
  return 'Under 2 hours left';
}
