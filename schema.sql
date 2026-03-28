-- ============================================================
-- VaultDeal — PostgreSQL Schema
-- Run this file to initialize the database
-- Compatible with Render managed PostgreSQL (Postgres 15+)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- GAMES
-- Core game metadata cached from Steam + CheapShark APIs
-- ============================================================
CREATE TABLE IF NOT EXISTS games (
  id                  SERIAL PRIMARY KEY,
  steam_app_id        INTEGER UNIQUE NOT NULL,
  cheapshark_id       VARCHAR(64),               -- CheapShark storeID reference
  title               TEXT NOT NULL,
  slug                TEXT,                       -- URL-friendly name
  description         TEXT,
  short_description   TEXT,
  header_image        TEXT,                       -- Steam CDN URL
  background_image    TEXT,
  screenshots         JSONB DEFAULT '[]',         -- Array of screenshot URLs
  developers          TEXT[],
  publishers          TEXT[],
  release_date        DATE,
  metacritic_score    SMALLINT,
  steam_review_score  SMALLINT,                  -- 0–100
  steam_review_desc   VARCHAR(64),               -- e.g. "Very Positive"
  total_reviews       INTEGER,
  is_free             BOOLEAN DEFAULT FALSE,
  coming_soon         BOOLEAN DEFAULT FALSE,
  genres              TEXT[],                     -- e.g. ['Action', 'RPG']
  tags                TEXT[],                     -- Steam user tags
  categories          TEXT[],                     -- e.g. ['Single-player', 'Co-op']
  website             TEXT,
  youtube_trailer_id  VARCHAR(16),                -- YouTube videoId, cached after first lookup
  steam_movies        JSONB DEFAULT '[]',         -- Normalized Steam mp4/webm clips
  metadata_fetched_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Migrations for existing deployments:
-- ALTER TABLE games ADD COLUMN IF NOT EXISTS youtube_trailer_id VARCHAR(16);
-- ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_movies JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_games_steam_app_id ON games(steam_app_id);
CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug);
CREATE INDEX IF NOT EXISTS idx_games_genres ON games USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_games_tags ON games USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_games_metacritic ON games(metacritic_score);

-- ============================================================
-- PRICE SNAPSHOTS
-- Time-series price data for each game from Steam + key sellers
-- ============================================================
CREATE TABLE IF NOT EXISTS price_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  store           VARCHAR(64) NOT NULL DEFAULT 'steam',
                  -- 'steam', 'g2a', 'kinguin', 'fanatical', 'gmg', 'humble'
  price_current   NUMERIC(10, 2) NOT NULL,
  price_regular   NUMERIC(10, 2),
  discount_pct    SMALLINT,                       -- 0–100
  is_on_sale      BOOLEAN DEFAULT FALSE,
  deal_id         VARCHAR(128),                   -- CheapShark dealID for deep link
  deal_url        TEXT,
  currency        VARCHAR(8) DEFAULT 'USD',
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_game_id ON price_snapshots(game_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_store ON price_snapshots(store);
CREATE INDEX IF NOT EXISTS idx_snapshots_recorded_at ON price_snapshots(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_on_sale ON price_snapshots(is_on_sale) WHERE is_on_sale = TRUE;

-- ============================================================
-- CURRENT DEALS VIEW
-- Materialized view of the latest price per game per store
-- Refresh after each price sync job
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS current_deals AS
  SELECT DISTINCT ON (game_id, store)
    ps.id,
    ps.game_id,
    ps.store,
    ps.price_current,
    ps.price_regular,
    ps.discount_pct,
    ps.is_on_sale,
    ps.deal_id,
    ps.deal_url,
    ps.recorded_at,
    g.title,
    g.slug,
    g.header_image,
    g.genres,
    g.tags,
    g.metacritic_score,
    g.steam_review_score,
    g.steam_review_desc,
    g.steam_app_id
  FROM price_snapshots ps
  JOIN games g ON g.id = ps.game_id
  ORDER BY game_id, store, recorded_at DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_current_deals_unique ON current_deals(game_id, store);
CREATE INDEX IF NOT EXISTS idx_current_deals_discount ON current_deals(discount_pct DESC);
CREATE INDEX IF NOT EXISTS idx_current_deals_genres ON current_deals USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_current_deals_on_sale ON current_deals(is_on_sale);

-- ============================================================
-- PRICE HISTORY HIGHS / LOWS
-- Pre-computed stats per game per store for fast chart rendering
-- ============================================================
CREATE TABLE IF NOT EXISTS price_stats (
  id                SERIAL PRIMARY KEY,
  game_id           INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  store             VARCHAR(64) NOT NULL DEFAULT 'steam',
  all_time_low      NUMERIC(10, 2),
  all_time_low_date TIMESTAMPTZ,
  all_time_high     NUMERIC(10, 2),
  last_sale_date    TIMESTAMPTZ,
  avg_discount_pct  SMALLINT,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, store)
);

-- ============================================================
-- WATCHLIST ITEMS
-- Persisted watchlists — anonymous (session) or user-linked
-- Phase 1: session_id based. Phase 2: user_id added.
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlist_items (
  id              BIGSERIAL PRIMARY KEY,
  session_id      VARCHAR(128),                  -- anonymous browser session
  user_id         INTEGER,                        -- NULL until user auth exists
  game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  target_price    NUMERIC(10, 2),                -- optional price alert threshold
  added_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_session ON watchlist_items(session_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_game ON watchlist_items(game_id);

-- ============================================================
-- USERS  [FUTURE — Phase 2]
-- Stubbed now so schema migrations are minimal later
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  email               VARCHAR(255) UNIQUE,
  password_hash       TEXT,                       -- NULL if Steam-only login
  steam_id            VARCHAR(32) UNIQUE,
  steam_display_name  TEXT,
  steam_avatar_url    TEXT,
  notification_email  VARCHAR(255),
  email_alerts        BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  last_login_at       TIMESTAMPTZ
);

-- ============================================================
-- USER STEAM LIBRARY  [FUTURE — Phase 2]
-- Owned games + playtime from Steam API
-- ============================================================
CREATE TABLE IF NOT EXISTS user_steam_library (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  steam_app_id    INTEGER NOT NULL,
  game_id         INTEGER REFERENCES games(id),  -- linked after game is in our DB
  playtime_mins   INTEGER DEFAULT 0,
  last_played_at  TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, steam_app_id)
);

CREATE INDEX IF NOT EXISTS idx_user_library_user ON user_steam_library(user_id);
CREATE INDEX IF NOT EXISTS idx_user_library_playtime ON user_steam_library(playtime_mins DESC);

-- ============================================================
-- USER TAG WEIGHTS  [FUTURE — Phase 2]
-- Pre-computed tag weights per user based on playtime
-- Algorithm: count tag occurrences across top 10 games by playtime,
-- weight by normalized playtime. Used for deal recommendations.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_tag_weights (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  weight      NUMERIC(6, 4) DEFAULT 0,            -- 0.0–1.0 normalized
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tag_weights_user ON user_tag_weights(user_id);
CREATE INDEX IF NOT EXISTS idx_tag_weights_weight ON user_tag_weights(weight DESC);

-- ============================================================
-- STEAM WISHLIST ITEMS  [FUTURE — Phase 2]
-- Imported from Steam API per user
-- ============================================================
CREATE TABLE IF NOT EXISTS user_wishlist (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  steam_app_id  INTEGER NOT NULL,
  game_id       INTEGER REFERENCES games(id),
  priority      INTEGER,                          -- Steam wishlist order
  added_on      DATE,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, steam_app_id)
);

-- ============================================================
-- PRICE ALERTS  [FUTURE — Phase 2]
-- Triggered when a game's price drops to or below target_price
-- ============================================================
CREATE TABLE IF NOT EXISTS price_alerts (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id      VARCHAR(128),                  -- fallback for anonymous users
  game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  target_price    NUMERIC(10, 2) NOT NULL,
  store           VARCHAR(64) DEFAULT 'any',     -- 'steam', 'any', etc.
  triggered_at    TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_game ON price_alerts(game_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(is_active) WHERE is_active = TRUE;

-- ============================================================
-- KEY SELLER PRICES  [FUTURE — Phase 3]
-- Prices from G2A, Kinguin, Fanatical, GMG, Humble
-- ============================================================
CREATE TABLE IF NOT EXISTS key_seller_prices (
  id              BIGSERIAL PRIMARY KEY,
  game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seller_site     VARCHAR(64) NOT NULL,           -- 'g2a', 'kinguin', 'fanatical', 'gmg', 'humble'
  seller_name     VARCHAR(128),                   -- individual seller username (G2A/Kinguin marketplace)
  seller_rating   NUMERIC(3, 2),                  -- 0.00–5.00
  seller_reviews  INTEGER,
  price           NUMERIC(10, 2) NOT NULL,
  currency        VARCHAR(8) DEFAULT 'USD',
  listing_url     TEXT,
  is_available    BOOLEAN DEFAULT TRUE,
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_sellers_game ON key_seller_prices(game_id);
CREATE INDEX IF NOT EXISTS idx_key_sellers_site ON key_seller_prices(seller_site);
CREATE INDEX IF NOT EXISTS idx_key_sellers_price ON key_seller_prices(price ASC);

-- ============================================================
-- SYNC LOG
-- Track when each data sync job ran and its outcome
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_log (
  id            SERIAL PRIMARY KEY,
  job_name      VARCHAR(64) NOT NULL,             -- 'cheapshark_deals', 'steam_metadata', etc.
  status        VARCHAR(16) NOT NULL,             -- 'success', 'partial', 'failed'
  games_synced  INTEGER DEFAULT 0,
  errors        JSONB DEFAULT '[]',
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

-- ============================================================
-- HELPER: Auto-update updated_at on games table
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- HELPER: Refresh materialized view (called after sync jobs)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_current_deals()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY current_deals;
END;
$$ LANGUAGE plpgsql;