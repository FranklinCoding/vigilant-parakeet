import { useState, useEffect } from 'react';

export default function TrailerEmbed({ gameId, gameTitle }) {
  const [videoId, setVideoId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | none | error
  const [showIframe, setShowIframe] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    setStatus('loading');
    fetch(`/api/games/${gameId}/trailer`)
      .then((r) => r.json())
      .then((data) => {
        if (data.videoId) {
          setVideoId(data.videoId);
          setStatus('ready');
        } else {
          setStatus('none');
        }
      })
      .catch(() => setStatus('error'));
  }, [gameId]);

  if (status === 'idle' || status === 'loading' || status === 'none' || status === 'error') {
    return null;
  }

  return (
    <div className="game-section trailer-section">
      <div className="game-section__title">Trailer</div>
      {showIframe ? (
        <iframe
          className="trailer-section__iframe"
          src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
          title={`${gameTitle} trailer`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="trailer-section__placeholder">
          <button
            className="trailer-section__btn"
            onClick={() => setShowIframe(true)}
          >
            ▶ Load Trailer
          </button>
        </div>
      )}
    </div>
  );
}
