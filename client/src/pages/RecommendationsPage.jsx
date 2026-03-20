import { useState } from 'react';
import { resolveSteamUrl, getRecommendations, getSteamProfile } from '../api';
import DealCard from '../components/DealCard';

export default function RecommendationsPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [profile, setProfile] = useState(null);
  const [selectedGenre, setSelectedGenre] = useState(null);

  function handleGenreClick(genre) {
    setSelectedGenre((prev) => (prev === genre ? null : genre));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setProfile(null);
    setSelectedGenre(null);

    try {
      const { steamId } = await resolveSteamUrl(input.trim());
      const [data, profileData] = await Promise.all([
        getRecommendations(steamId),
        getSteamProfile(steamId).catch(() => null),
      ]);
      setResult(data);
      setProfile(profileData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">For You</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Enter your Steam profile URL to get deal recommendations based on your most-played games.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
        <input
          className="filters__input"
          style={{ width: 360 }}
          type="text"
          placeholder="https://steamcommunity.com/id/yourname"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="filters__btn" type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Find Deals'}
        </button>
      </form>

      {loading && <div className="spinner" />}

      {!loading && error && (
        <p className="state-msg">{error}</p>
      )}

      {!loading && result && (
        <>
          {/* Steam profile */}
          {profile && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 16px',
              marginBottom: 24,
              width: 'fit-content',
            }}>
              <img
                src={profile.avatarUrl}
                alt={profile.personaName}
                style={{ width: 48, height: 48, borderRadius: 4, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{profile.personaName}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>Steam profile matched</div>
              </div>
            </div>
          )}

          {/* Seed games */}
          <div style={{ marginBottom: 28 }}>
            <div className="game-section__title">Based on your top games</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {result.seedGames.map((g) => (
                <div
                  key={g.name}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '6px 12px',
                    fontSize: 13,
                  }}
                >
                  <span>{g.name}</span>
                  {g.playtimeMins > 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>
                      {Math.round(g.playtimeMins / 60)}h
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="game-section__title">Your top genres</div>
            <div className="game-hero__tags">
              {result.topGenres.slice(0, 8).map((t) => {
                const active = selectedGenre === t.genre;
                return (
                  <span
                    key={t.genre}
                    className={`tag tag--clickable${active ? ' tag--active' : ''}`}
                    onClick={() => handleGenreClick(t.genre)}
                    title={active ? 'Click to clear filter' : `Filter by ${t.genre}`}
                  >
                    {t.genre}
                  </span>
                );
              })}
            </div>
            {selectedGenre && (
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                Showing deals tagged <strong style={{ color: 'var(--accent)' }}>{selectedGenre}</strong> — click the tag again to clear
              </p>
            )}
          </div>

          {/* Top Picks */}
          {(() => {
            const picks = selectedGenre
              ? result.topPicks.filter((d) => d.genres?.includes(selectedGenre))
              : result.topPicks;
            return picks.length > 0 ? (
              <div style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Top Picks</h2>
                <div className="deal-grid">
                  {picks.map((deal) => (
                    <DealCard key={`${deal.game_id}-${deal.store}`} deal={deal} />
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Hidden Gems */}
          {(() => {
            const gems = selectedGenre
              ? result.hiddenGems.filter((d) => d.genres?.includes(selectedGenre))
              : result.hiddenGems;
            return gems.length > 0 ? (
              <div style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Hidden Gems</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                  Highly rated games that match your taste
                </p>
                <div className="deal-grid">
                  {gems.map((deal) => (
                    <DealCard key={`${deal.game_id}-${deal.store}`} deal={deal} />
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {(() => {
            const picks = selectedGenre
              ? result.topPicks.filter((d) => d.genres?.includes(selectedGenre))
              : result.topPicks;
            const gems = selectedGenre
              ? result.hiddenGems.filter((d) => d.genres?.includes(selectedGenre))
              : result.hiddenGems;
            return picks.length === 0 && gems.length === 0 ? (
              <p className="state-msg">
                {selectedGenre
                  ? `No deals found for "${selectedGenre}" right now.`
                  : 'No matching deals found right now. Try again after the next sync.'}
              </p>
            ) : null;
          })()}
        </>
      )}
    </div>
  );
}
