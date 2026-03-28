const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth');
const { buildDiscoverySections, normalizeTags, toIntArray } = require('../lib/discovery');

const router = Router();

router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const ownedAppIds = toIntArray(req.body?.ownedAppIds || []);
    const likedTags = normalizeTags(req.body?.likedTags || []);
    const dislikedTags = normalizeTags(req.body?.dislikedTags || []);
    const recentTags = normalizeTags(req.body?.recentTags || []);

    const data = await buildDiscoverySections({
      ownedAppIds,
      likedTags,
      dislikedTags,
      recentTags,
      user: req.user || null,
    });

    res.json({
      sections: data.sections.filter((section) =>
        ['recommended', 'because-you-played', 'hidden-gems'].includes(section.id)
      ),
      hero: data.hero,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
