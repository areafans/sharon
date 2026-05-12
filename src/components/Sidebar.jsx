import { useMemo } from 'react';
import { supabase } from '../lib/supabase';
import Icons from './Icons';
import Avatar from './Avatar';

export default function Sidebar({ view, onNav, onUpload, activeTags, onToggleTag, items, ideas, session }) {
  const user = session?.user;

  const popularTags = useMemo(() => {
    const counts = {};
    items.forEach(item => item.tags?.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [items]);

  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'SE User';

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SE</div>
        <div className="brand-name">
          Content Hub
          <small>Solutions Engineering</small>
        </div>
      </div>

      <div className="nav-section">
        <button
          className={`nav-item ${view === 'library' ? 'active' : ''}`}
          onClick={() => onNav('library')}
        >
          <span className="nav-icon"><Icons.Library size={16} /></span>
          Library
          <span className="nav-count">{items.length}</span>
        </button>
        <button
          className={`nav-item ${view === 'ideas' ? 'active' : ''}`}
          onClick={() => onNav('ideas')}
        >
          <span className="nav-icon"><Icons.Bulb size={16} /></span>
          Ideas
          <span className="nav-count">{ideas.length}</span>
        </button>
        <button
          className={`nav-item ${view === 'chat' ? 'active' : ''}`}
          onClick={() => onNav('chat')}
        >
          <span className="nav-icon"><Icons.Sparkle size={16} /></span>
          Chat
        </button>
        <button
          className={`nav-item ${view === 'analytics' ? 'active' : ''}`}
          onClick={() => onNav('analytics')}
        >
          <span className="nav-icon"><Icons.BarChart size={16} /></span>
          Analytics
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-label">Tags</div>
        <button
          className={`tag-item ${activeTags.length === 0 ? 'active' : ''}`}
          onClick={() => onToggleTag(null)}
        >
          <span className="tag-dot" />
          All content
          <span className="tag-count">{items.length}</span>
        </button>
        {popularTags.map(([tag, count]) => (
          <button
            key={tag}
            className={`tag-item ${activeTags.includes(tag) ? 'active' : ''}`}
            onClick={() => onToggleTag(tag)}
          >
            <span className="tag-dot" />
            {tag}
            <span className="tag-count">{count}</span>
          </button>
        ))}
      </div>

      <div className="nav-section">
        <button
          className="btn btn-accent"
          style={{ justifyContent: 'center', width: '100%', padding: '9px 12px' }}
          onClick={onUpload}
        >
          <Icons.Upload size={14} /> Upload content
        </button>
      </div>

      <div className="user-card">
        <Avatar user={user} size="sm" />
        <div>
          <div className="user-name">{name}</div>
          <div className="user-role">Solutions Eng</div>
        </div>
        <button
          style={{ marginLeft: 'auto', display: 'grid', placeItems: 'center', padding: 4, borderRadius: 4 }}
          onClick={handleSignOut}
          title="Sign out"
        >
          <Icons.Settings size={14} stroke="var(--muted)" />
        </button>
      </div>
    </aside>
  );
}
