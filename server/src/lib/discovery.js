const db = require('../db');

function toIntArray(values = []) {
  return values
    .map((value) => parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function normalizeTags(values = []) {
  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => value.toLowerCase())
  )];
}

function scoreGame(game, context = {}) {
  const tags = normalizeTags([...(game.genres || []), ...(game.tags || [])]);
  const likedTagMatches = tags.filter((tag) => context.likedTags.includes(tag)).length;
  const dislikedTagMatches = tags.filter((tag) => context.dislikedTags.includes(tag)).length;
  const recentTagMatches = tags.filter((tag) => context.recentTags.includes(tag)).length;

  let score = 0;
  score += (Number(game.discount_pct) || 0) * 0.45;
  score += (Number(game.steam_review_score) || 0) * 0.3;
  score += Math.min(Number(game.metacritic_score) || 0, 100) * 0.15;
  score += Math.min(Number(game.popularity_rank) || 0, 100) * 0.2;
  score += likedTagMatches * 18;
  score += recentTagMatches * 14;
  score -= dislikedTagMatches * 24;
  if (game.store === 'epic' && game.promo_type === 'free') score += 26;
  if (game.has_demo) score += 8;
  if (game.has_bundle) score += 6;
  if (context.ownedAppIds.has(game.steam_app_id)) score -= 120;
  return score;
}

function enrichReason(game, context = {}) {
  const tags = normalizeTags([...(game.genres || []), ...(game.tags || [])]);
  const matched = tags.filter((tag) => context.likedTags.includes(tag) || context.recentTags.includes(tag));
  if (game.store === 'epic' && game.promo_type === 'free' && game.promo_ends_at) {
    return 'Free to claim right now on Epic.';
  }
  if (matched.length > 0) {
    return `Fits your taste for ${matched.slice(0, 2).join(' and ')}.`;
  }
  if ((game.discount_pct || 0) >= 50) {
    return 'A strong discount on a high-signal pick.';
  }
  return 'A standout pick based on reviews, popularity, and freshness.';
}

async function fetchCurrentDeals(filters = {}) {
  const conditions = ['cd.price_current IS NOT NULL'];
  const params = [];

  if (filters.onSaleOnly) {
    conditions.push('(cd.is_on_sale = TRUE OR cd.promo_type = \'free\')');
  }
  if (filters.storeType) {
    params.push(filters.storeType);
    conditions.push(`cd.store_type = $${params.length}`);
  }
  if (filters.store) {
    params.push(filters.store);
    conditions.push(`cd.store = $${params.length}`);
  }
  if (filters.freeOnly) {
    conditions.push('(cd.promo_type = \'free\' OR cd.price_current = 0)');
  }
  if (filters.endingSoon) {
    conditions.push('(COALESCE(cd.sale_ends_at, cd.promo_ends_at) BETWEEN NOW() AND NOW() + INTERVAL \'72 hours\')');
  }
  if (filters.excludeOwned?.length) {
    params.push(filters.excludeOwned);
    conditions.push(`NOT (cd.steam_app_id = ANY($${params.length}))`);
  }
  if (filters.requireTags?.length) {
    params.push(filters.requireTags);
    conditions.push(`(cd.genres && $${params.length}::text[] OR cd.tags && $${params.length}::text[])`);
  }

  const orderBy = filters.orderBy || 'cd.discount_pct DESC NULLS LAST, cd.steam_review_score DESC NULLS LAST, cd.recorded_at DESC';
  const limit = Math.max(1, Math.min(parseInt(filters.limit || 12, 10), 36));
  params.push(limit);

  const { rows } = await db.query(
    `SELECT
       cd.game_id,
       cd.title,
       cd.slug,
       cd.header_image,
       cd.store,
       cd.store_type,
       cd.price_current,
       cd.price_regular,
       cd.discount_pct,
       cd.is_on_sale,
       cd.promo_type,
       cd.promo_label,
       cd.promo_starts_at,
       cd.promo_ends_at,
       cd.sale_ends_at,
       cd.deal_url,
       cd.genres,
       cd.tags,
       cd.metacritic_score,
       cd.steam_review_score,
       cd.steam_review_desc,
       cd.steam_app_id,
       cd.is_free,
       cd.has_demo,
       cd.has_bundle,
       cd.recorded_at,
       CASE
         WHEN cd.store = 'steam' THEN 92
         WHEN cd.store = 'epic' THEN 88
         ELSE 70
       END AS popularity_rank
     FROM current_deals cd
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT $${params.length}`,
    params
  );

  return rows;
}

function pickTopGames(games, count, context) {
  return [...games]
    .map((game) => ({
      ...game,
      score: scoreGame(game, context),
      reason: enrichReason(game, context),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

function buildRecommendationContext({ ownedAppIds = [], likedTags = [], dislikedTags = [], recentTags = [] } = {}) {
  return {
    ownedAppIds: new Set(toIntArray(ownedAppIds)),
    likedTags: normalizeTags(likedTags),
    dislikedTags: normalizeTags(dislikedTags),
    recentTags: normalizeTags(recentTags),
  };
}

async function buildDiscoverySections(input = {}) {
  const context = buildRecommendationContext(input);
  const [featuredPool, epicFree, endingSoon, popularNow, recommendationPool, hiddenGemPool] = await Promise.all([
    fetchCurrentDeals({ onSaleOnly: true, storeType: 'official', limit: 18 }),
    fetchCurrentDeals({
      store: 'epic',
      freeOnly: true,
      limit: 12,
      orderBy: 'COALESCE(cd.promo_ends_at, cd.sale_ends_at) ASC NULLS LAST, cd.recorded_at DESC',
    }),
    fetchCurrentDeals({
      onSaleOnly: true,
      storeType: 'official',
      endingSoon: true,
      limit: 12,
      orderBy: 'COALESCE(cd.sale_ends_at, cd.promo_ends_at) ASC NULLS LAST, cd.discount_pct DESC NULLS LAST',
    }),
    fetchCurrentDeals({
      onSaleOnly: true,
      storeType: 'official',
      limit: 12,
      orderBy: 'cd.steam_review_score DESC NULLS LAST, cd.discount_pct DESC NULLS LAST, cd.recorded_at DESC',
    }),
    fetchCurrentDeals({
      onSaleOnly: true,
      storeType: 'official',
      excludeOwned: [...context.ownedAppIds],
      limit: 24,
    }),
    fetchCurrentDeals({
      onSaleOnly: true,
      storeType: 'official',
      excludeOwned: [...context.ownedAppIds],
      limit: 24,
      orderBy: 'cd.metacritic_score DESC NULLS LAST, cd.discount_pct DESC NULLS LAST, cd.recorded_at DESC',
    }),
  ]);

  const featured = pickTopGames(featuredPool, 6, context);
  const recommended = pickTopGames(recommendationPool, 8, context);
  const becauseYouPlayed = pickTopGames(
    recommendationPool.filter((game) => normalizeTags([...(game.genres || []), ...(game.tags || [])]).some((tag) => context.recentTags.includes(tag))),
    8,
    context
  );
  const hiddenGems = pickTopGames(
    hiddenGemPool.filter((game) => (game.steam_review_score || 0) >= 80 && (game.discount_pct || 0) >= 20),
    8,
    context
  );

  return {
    hero: featured.slice(0, 3),
    sections: [
      { id: 'epic-free', title: 'Free on Epic right now', subtitle: 'Claim these while the window is open.', items: epicFree.map((game) => ({ ...game, reason: 'Free to claim before the timer runs out.' })) },
      { id: 'ending-soon', title: 'Ending soon', subtitle: 'Sales and freebies that are close to expiring.', items: endingSoon.map((game) => ({ ...game, reason: 'Worth a look before this window closes.' })) },
      { id: 'popular-now', title: 'Popular on sale', subtitle: 'Big games people will recognize immediately.', items: popularNow.map((game) => ({ ...game, reason: 'A crowd-favorite with a timely discount.' })) },
      { id: 'recommended', title: 'Recommended for you', subtitle: 'Powered by your library, playtime, and quick picks.', items: recommended },
      { id: 'because-you-played', title: 'Because you played', subtitle: 'Close cousins to the games you spend time with.', items: becauseYouPlayed.length ? becauseYouPlayed : recommended.slice(0, 8) },
      { id: 'hidden-gems', title: 'Try something different', subtitle: 'Smart left-field picks with strong upside.', items: hiddenGems.length ? hiddenGems : recommended.slice(0, 8) },
    ],
  };
}

module.exports = {
  buildDiscoverySections,
  buildRecommendationContext,
  normalizeTags,
  pickTopGames,
  toIntArray,
};
