import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icons from './Icons';
import Avatar from './Avatar';

const TAGS_COLLAPSED_KEY = 'sidebar.tags.collapsed';
const CONVERSATIONS_COLLAPSED_KEY = 'sidebar.conversations.collapsed';

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  view, onNav, onUpload,
  activeTags, onToggleTag,
  items, ideas, session,
  chatSessions = [], activeChatSessionId,
  onSelectChat, onNewChat, onDeleteChat,
}) {
  const user = session?.user;
  const [tagsCollapsed, setTagsCollapsed] = useState(
    () => localStorage.getItem(TAGS_COLLAPSED_KEY) === '1'
  );
  const [conversationsCollapsed, setConversationsCollapsed] = useState(
    () => localStorage.getItem(CONVERSATIONS_COLLAPSED_KEY) === '1'
  );

  function toggleTagsCollapsed() {
    setTagsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(TAGS_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  function toggleConversationsCollapsed() {
    setConversationsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(CONVERSATIONS_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

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
        <img className="brand-mark" src="/sharon-logo.png" alt="Sharon" />
        <div className="brand-name">Sharon</div>
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

      <div className="nav-section sidebar-conversations">
        <button
          type="button"
          className="nav-label nav-label-toggle"
          onClick={toggleConversationsCollapsed}
          aria-expanded={!conversationsCollapsed}
        >
          <span>Conversations</span>
          {conversationsCollapsed
            ? <Icons.ChevronRight size={12} stroke="currentColor" />
            : <Icons.ChevronDown size={12} stroke="currentColor" />}
        </button>
        {!conversationsCollapsed && (
          <>
            <button className="sidebar-new-chat" onClick={onNewChat}>
              <Icons.Plus size={12} /> New chat
            </button>
            {chatSessions.length === 0 && (
              <div className="sidebar-conversations-empty">
                No chats yet
              </div>
            )}
            {chatSessions.slice(0, 10).map(sess => (
              <div
                key={sess.id}
                className={`chat-session-item ${sess.id === activeChatSessionId ? 'active' : ''}`}
                onClick={() => onSelectChat?.(sess.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onSelectChat?.(sess.id)}
              >
                <div className="chat-session-item-body">
                  <div className="chat-session-name">{sess.title || 'Untitled chat'}</div>
                  <div className="chat-session-meta">
                    <span>{relativeTime(sess.updated_at || sess.created_at)}</span>
                  </div>
                </div>
                <button
                  className="chat-session-delete"
                  title="Delete conversation"
                  onClick={e => { e.stopPropagation(); onDeleteChat?.(sess.id); }}
                >
                  <Icons.Trash size={12} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {view === 'library' && (
        <div className="nav-section">
          <button
            type="button"
            className="nav-label nav-label-toggle"
            onClick={toggleTagsCollapsed}
            aria-expanded={!tagsCollapsed}
          >
            <span>Tags</span>
            {tagsCollapsed
              ? <Icons.ChevronRight size={12} stroke="currentColor" />
              : <Icons.ChevronDown size={12} stroke="currentColor" />}
          </button>
          {!tagsCollapsed && (
            <>
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
            </>
          )}
        </div>
      )}

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
          aria-label="Sign out"
        >
          <Icons.LogOut size={14} stroke="var(--muted)" />
        </button>
      </div>
    </aside>
  );
}
