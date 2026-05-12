import Avatar from './Avatar';
import Icons from './Icons';
import Poster from './Poster';

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TYPE_LABELS = { deck: 'Deck', video: 'Video', demo: 'Demo', doc: 'Doc', code: 'Code' };

export default function ContentCard({ item, layout = 'grid', onOpen }) {
  const uploader = item.uploader || {};
  const avgRating = item.avg_rating ?? item.rating ?? 0;
  const tags = item.tags || [];

  if (layout === 'list') {
    return (
      <div className="content-row" onClick={onOpen}>
        <div className="row-poster">
          <Poster item={item} compact />
        </div>
        <div className="row-main">
          <div className="row-title">{item.title}</div>
          {item.description && (
            <div className="row-desc">{item.description}</div>
          )}
          {tags.length > 0 && (
            <div className="card-tags" style={{ marginTop: 4 }}>
              {tags.slice(0, 4).map(t => (
                <span key={t} className="chip">{t}</span>
              ))}
              {tags.length > 4 && <span className="chip">+{tags.length - 4}</span>}
            </div>
          )}
        </div>
        <div className="row-meta">
          <div className="row-meta-type">{TYPE_LABELS[item.content_type] || item.content_type}</div>
          <div className="row-meta-uploader">
            <Avatar user={uploader} size="sm" />
            <span>{(uploader.name || uploader.email || 'Unknown').split(' ')[0]}</span>
          </div>
          <div className="row-meta-stats">
            {avgRating > 0 && (
              <span className="meta rating">
                <Icons.Star size={11} filled stroke="var(--gold)" fill="var(--gold)" />
                {Number(avgRating).toFixed(1)}
              </span>
            )}
            <span className="meta">
              <Icons.Eye size={11} /> {item.view_count ?? 0}
            </span>
            <span className="meta">{timeAgo(item.created_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-card" onClick={onOpen}>
      <Poster item={item} />
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        {item.description && (
          <div className="card-desc">{item.description}</div>
        )}
        <div className="card-tags">
          {tags.slice(0, 3).map(t => (
            <span key={t} className="chip">{t}</span>
          ))}
          {tags.length > 3 && (
            <span className="chip">+{tags.length - 3}</span>
          )}
        </div>
      </div>
      <div className="card-footer">
        <Avatar user={uploader} size="sm" />
        <span className="uploader-name">
          {(uploader.name || uploader.email || 'Unknown').split(' ')[0]}
        </span>
        <span className="dot" />
        <span className="meta">{timeAgo(item.created_at)}</span>
        <div style={{ marginLeft: 'auto' }} className="row">
          {avgRating > 0 && (
            <>
              <span className="meta rating">
                <Icons.Star size={11} filled stroke="var(--gold)" fill="var(--gold)" />
                {' '}{Number(avgRating).toFixed(1)}
              </span>
              <span className="dot" />
            </>
          )}
          <span className="meta">
            <Icons.Eye size={11} /> {item.view_count ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
}
