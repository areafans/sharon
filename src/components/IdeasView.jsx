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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function IdeasView({ ideas, onOpenContent, onNewIdea, onIdeaUpdated, session }) {
  const user = session?.user;

  return (
    <div className="ideas-view">
      <div className="library-header">
        <div className="library-title-row">
          <div>
            <div className="page-sub">Ideas · Shared brainstorm space</div>
            <h1 className="page-title">Drafts the team is kicking around</h1>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 16,
        padding: '14px 16px',
        border: '1px dashed var(--line-strong)',
        borderRadius: 10,
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <div className="ai-orb-sm"><Icons.Sparkle size={13} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5 }}>Got an idea? Talk it through with the assistant.</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--muted)',
            letterSpacing: '0.04em',
            marginTop: 2,
          }}>
            BRAINSTORM MODE · DROP A FREEFORM IDEA AND IT&apos;LL HELP YOU SHAPE IT
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onNewIdea}>
          Start in chat <Icons.ChevronRight size={13} />
        </button>
      </div>

      <div className="ideas-grid">
        {ideas.map(idea => {
          const artifact = idea.artifact || {};
          const outline = artifact.outline || artifact.sections || [];
          const summary = artifact.summary || idea.summary || '';
          const creator = idea.creator || {};

          return (
            <div key={idea.id} className={`idea-card ${idea.published ? 'published' : ''}`}>
              <div className="stage">
                {idea.published
                  ? <><Icons.CheckCircle size={11} stroke="var(--forest)" /> Published · in library</>
                  : 'Draft'}
              </div>
              <h3>{idea.title || 'Untitled idea'}</h3>
              {summary && <p>{summary}</p>}
              {outline.length > 0 && (
                <ul className="idea-outline">
                  {outline.slice(0, 4).map((o, i) => (
                    <li key={i}>{typeof o === 'string' ? o : o.title || o.label || ''}</li>
                  ))}
                  {outline.length > 4 && (
                    <li style={{ color: 'var(--muted)' }}>+ {outline.length - 4} more</li>
                  )}
                </ul>
              )}
              <div className="idea-card-foot">
                <Avatar user={creator} size="sm" />
                <span>{(creator.name || creator.email || 'Unknown').split(' ')[0]}</span>
                <span className="dot" style={{ width: 2, height: 2, background: 'var(--muted-2)', borderRadius: '50%' }} />
                <span>{timeAgo(idea.created_at)}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {!idea.published && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    >
                      Promote
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                  >
                    Open
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {ideas.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            padding: 60,
            textAlign: 'center',
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
          }}>
            No ideas yet. Start a brainstorm in the chat panel →
          </div>
        )}
      </div>
    </div>
  );
}
