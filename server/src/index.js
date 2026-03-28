const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const healthRouter = require('./routes/health');
const dealsRouter = require('./routes/deals');
const gamesRouter = require('./routes/games');
const steamRouter = require('./routes/steam');
const resellersRouter = require('./routes/resellers');
const authRouter = require('./routes/auth');
const discoveryRouter = require('./routes/discovery');
const recommendationsRouter = require('./routes/recommendations');
const accountsRouter = require('./routes/accounts');

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/games', gamesRouter);
app.use('/api/steam', steamRouter);
app.use('/api/resellers', resellersRouter);
app.use('/api/auth', authRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/accounts', accountsRouter);

// Serve React build in production
if (config.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  // 404 for API-only dev mode
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`[server] Listening on port ${config.port} (${config.nodeEnv})`);
});

module.exports = app;
