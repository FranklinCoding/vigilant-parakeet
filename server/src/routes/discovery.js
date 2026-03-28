const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth');
const { buildDiscoverySections, normalizeTags, toIntArray } = require('../lib/discovery');

const router = Router();

router.get('/home', optionalAuth, async (req, res, next) => {
  try {
    const owned = toIntArray(String(req.query.owned || '').split(','));
    const likedTags = normalizeTags(String(req.query.likes || '').split(','));
    const dislikedTags = normalizeTags(String(req.query.dislikes || '').split(','));
    const recentTags = normalizeTags(String(req.query.recentTags || '').split(','));

    const data = await buildDiscoverySections({
      ownedAppIds: owned,
      likedTags,
      dislikedTags,
      recentTags,
      user: req.user || null,
    });

    res.json({
      generatedAt: new Date().toISOString(),
      filters: {
        stores: ['all', 'steam', 'epic', 'free'],
      },
      ...data,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
