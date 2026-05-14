import Icons from './Icons';
import Avatar from './Avatar';

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function IdeaModal({ idea, onClose }) {
  const artifact = idea.artifact || {};
  const outline = artifact.outline || artifact.sections || [];
  const summary = artifact.summary || idea.summary || '';
  const creator = idea.creator || {};

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button className="modal-close" onClick={onClose}><Icons.Close size={16} /></button>
      <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
        <div className="detail-grid">
          <div className="detail-main">
            <div className="detail-type-row">
              <Icons.Bulb size={13} stroke="var(--accent)" />
              Idea
              {idea.published && <> · <Icons.CheckCircle size={11} stroke="var(--forest)" /> Published</>}
              {!idea.published && <> · Draft</>}
            </div>
            <h1 className="detail-title">{idea.title || 'Untitled idea'}</h1>
            {summary && (
              <p className="detail-desc">{summary}</p>
            )}

            {outline.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-label">Outline</div>
                <ul className="idea-outline" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                  {outline.map((o, i) => (
                    <li key={i} style={{ fontSize: 14 }}>
                      {typeof o === 'string' ? o : o.title || o.label || ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {artifact.notes && (
              <div className="detail-section">
                <div className="detail-section-label">Notes</div>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7 }}>{artifact.notes}</p>
              </div>
            )}
          </div>

          <aside className="detail-side">
            <div className="side-row">
              <div className="label">Creator</div>
              <div className="value">
                <div className="row">
                  <Avatar user={creator} size="sm" />
                  <div>
                    <div style={{ fontWeight: 500 }}>{creator.name || creator.email || 'Unknown'}</div>
                    {creator.email && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.04em' }}>
                        {creator.email}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="side-row">
              <div className="label">Created</div>
              <div className="value">{timeAgo(idea.created_at)}</div>
            </div>
            <div className="side-row">
              <div className="label">Status</div>
              <div className="value">
                {idea.published
                  ? <span className="chip forest"><Icons.CheckCircle size={10} /> Published</span>
                  : <span className="chip">Draft</span>}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
