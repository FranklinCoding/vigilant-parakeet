export default function SkeletonCard() {
  return (
    <div className="deal-card deal-card--skeleton">
      <div className="deal-card__art">
        <div
          className="deal-card__img skeleton-shimmer"
          style={{ display: 'block' }}
        />
      </div>
      <div className="deal-card__body">
        <div
          className="skeleton-shimmer skeleton-line"
          style={{ width: '85%', height: 13, marginBottom: 5 }}
        />
        <div
          className="skeleton-shimmer skeleton-line"
          style={{ width: '55%', height: 11 }}
        />
        <div className="deal-card__meta" style={{ marginTop: 'auto', paddingTop: 8 }}>
          <div
            className="skeleton-shimmer skeleton-line"
            style={{ width: 48, height: 22 }}
          />
          <div
            className="skeleton-shimmer skeleton-line"
            style={{ width: 36, height: 14, marginLeft: 6 }}
          />
        </div>
      </div>
    </div>
  );
}
