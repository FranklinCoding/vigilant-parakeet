import { useState, useEffect, useCallback } from 'react';

export default function MediaGallery({ screenshots = [], movies = [] }) {
  const [lightbox, setLightbox] = useState(null); // { index, items }

  // Build flat item list: movies first (with type), then screenshots
  const items = [
    ...movies.map((m) => ({ type: 'video', ...m })),
    ...screenshots.map((s) => ({ type: 'image', ...s })),
  ];

  const openLightbox = (index) => setLightbox({ index });
  const closeLightbox = () => setLightbox(null);
  const prev = () => setLightbox((lb) => ({ index: (lb.index - 1 + items.length) % items.length }));
  const next = () => setLightbox((lb) => ({ index: (lb.index + 1) % items.length }));

  const handleKey = useCallback((e) => {
    if (!lightbox) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  }, [lightbox]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (items.length === 0) return null;

  const activeItem = lightbox ? items[lightbox.index] : null;

  return (
    <div className="game-section media-gallery">
      <div className="game-section__title">Screenshots &amp; Videos</div>
      <div className="media-gallery__strip">
        {items.map((item, i) => (
          <div
            key={i}
            className="media-gallery__thumb"
            onClick={() => openLightbox(i)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && openLightbox(i)}
          >
            <img
              src={item.type === 'video' ? item.thumbnail : item.path_thumbnail}
              alt={item.type === 'video' ? item.name : `Screenshot ${i + 1}`}
              loading="lazy"
            />
            {item.type === 'video' && (
              <div className="media-gallery__play-icon">▶</div>
            )}
          </div>
        ))}
      </div>

      {lightbox && activeItem && (
        <div
          className="media-gallery__lightbox"
          onClick={closeLightbox}
        >
          <div
            className="media-gallery__lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            {activeItem.type === 'video' ? (
              <video
                src={activeItem.mp4_480}
                controls
                autoPlay
                preload="none"
                className="media-gallery__lightbox-content"
              />
            ) : (
              <img
                src={activeItem.path_full}
                alt={`Screenshot ${lightbox.index + 1}`}
              />
            )}
          </div>

          <button
            className="media-gallery__lightbox-close"
            onClick={closeLightbox}
            aria-label="Close"
          >
            ✕
          </button>

          {items.length > 1 && (
            <>
              <button
                className="media-gallery__lightbox-nav media-gallery__lightbox-nav--prev"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                className="media-gallery__lightbox-nav media-gallery__lightbox-nav--next"
                onClick={(e) => { e.stopPropagation(); next(); }}
                aria-label="Next"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
