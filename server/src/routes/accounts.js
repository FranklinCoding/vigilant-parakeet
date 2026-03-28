const { Router } = require('express');

const router = Router();

router.get('/epic/status', (_req, res) => {
  res.json({
    provider: 'epic',
    available: false,
    state: 'coming_soon',
    title: 'Epic account linking is being prepared',
    message: 'The app UI and APIs are ready for Epic linking, but the live account connection still needs external credentials and platform setup.',
    capabilities: [
      'Personalized recommendations will use Epic ownership once live.',
      'Free-game claims and sale merchandising already surface without linking.',
      'The final login flow will be enabled without changing the homepage UX.',
    ],
  });
});

router.post('/epic/connect', (_req, res) => {
  res.status(202).json({
    ok: false,
    provider: 'epic',
    state: 'coming_soon',
    message: 'Epic account linking is not active yet. Complete the external Epic app setup to enable this endpoint.',
  });
});

module.exports = router;
