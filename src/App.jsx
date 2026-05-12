import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import Auth from './pages/Auth';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LibraryView from './components/LibraryView';
import IdeasView from './components/IdeasView';
import DetailModal from './components/DetailModal';
import UploadModal from './components/UploadModal';
import ShareModal from './components/ShareModal';
import ChatPanel from './components/ChatPanel';
import ChatView from './components/ChatView';
import Toast from './components/Toast';
import Icons from './components/Icons';

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App navigation
  const [view, setView] = useState('library');
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [dateFilter, setDateFilter] = useState('all');
  const [uploaderFilter, setUploaderFilter] = useState('all');

  // Modals
  const [openItem, setOpenItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Chat
  const [chatCollapsed, setChatCollapsed] = useState(false);

  // Notifications
  const [toasts, setToasts] = useState([]);

  // Data
  const [items, setItems] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Fetch data when authenticated
  useEffect(() => {
    if (!session) return;
    fetchContent();
    fetchIdeas();
  }, [session?.user?.id]);

  async function fetchContent() {
    setDataLoading(true);
    const { data, error } = await supabase
      .from('content_items')
      .select(`
        id, title, description, content_type, tags,
        view_count, share_count, created_at, updated_at,
        file_url, is_external_url, file_name, file_mime_type,
        embedding_status, embedding_chunk_count,
        uploader:users(id, name, email, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Also fetch avg ratings
      const { data: ratings } = await supabase
        .from('ratings')
        .select('content_id, score');

      const ratingMap = {};
      if (ratings) {
        ratings.forEach(r => {
          if (!ratingMap[r.content_id]) ratingMap[r.content_id] = [];
          ratingMap[r.content_id].push(r.score);
        });
      }

      setItems(data.map(item => ({
        ...item,
        avg_rating: ratingMap[item.id]
          ? ratingMap[item.id].reduce((a, b) => a + b, 0) / ratingMap[item.id].length
          : 0,
        rating_count: ratingMap[item.id]?.length ?? 0,
      })));
    }
    setDataLoading(false);
  }

  async function fetchIdeas() {
    const { data } = await supabase
      .from('ideas')
      .select(`
        id, title, artifact, published, created_at, updated_at,
        creator:users(id, name, email, avatar_url)
      `)
      .order('created_at', { ascending: false });
    if (data) setIdeas(data);
  }

  function toggleTag(tag) {
    if (tag === null) { setActiveTags([]); return; }
    setActiveTags(a => a.includes(tag) ? a.filter(x => x !== tag) : [...a, tag]);
  }

  function pushToast(msg, icon = 'check') {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, msg, icon }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 2600);
  }

  async function handleSaveIdea(draft) {
    if (!draft) return;
    const { error } = await supabase.from('ideas').insert({
      created_by: session.user.id,
      title: draft.title,
      artifact: draft,
      published: false,
    });
    if (!error) {
      fetchIdeas();
      pushToast('Saved to Ideas — visible to the team', 'check');
    }
  }

  function handleUploaded() {
    fetchContent();
    pushToast('Added · embedding generated — discoverable in chat', 'ai');
  }

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="brand-mark">SE</div>
        <div className="thinking"><span /><span /><span /></div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className={`app ${view === 'chat' ? 'chat-fullscreen' : chatCollapsed ? 'chat-collapsed' : ''}`}>
      <Sidebar
        view={view}
        onNav={setView}
        onUpload={() => setUploadOpen(true)}
        activeTags={activeTags}
        onToggleTag={toggleTag}
        items={items}
        ideas={ideas}
        session={session}
      />

      <main className="main">
        <TopBar
          search={search}
          onSearch={setSearch}
          onUpload={() => setUploadOpen(true)}
          theme={theme}
          onTheme={setTheme}
        />
        {view === 'library' && (
          <LibraryView
            items={items}
            loading={dataLoading}
            search={search}
            activeTags={activeTags}
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
            sort={sort}
            onSort={setSort}
            dateFilter={dateFilter}
            onDateFilter={setDateFilter}
            uploaderFilter={uploaderFilter}
            onUploaderFilter={setUploaderFilter}
            session={session}
            onOpenContent={setOpenItem}
          />
        )}
        {view === 'ideas' && (
          <IdeasView
            ideas={ideas}
            onOpenContent={setOpenItem}
            onNewIdea={() => setChatCollapsed(false)}
            session={session}
            onIdeaUpdated={fetchIdeas}
          />
        )}
        {view === 'chat' && (
          <ChatView
            session={session}
            items={items}
            onOpenContent={setOpenItem}
          />
        )}
      </main>

      {view !== 'chat' && (
        <ChatPanel
          collapsed={chatCollapsed}
          onToggle={() => setChatCollapsed(c => !c)}
          onOpenContent={setOpenItem}
          onSaveIdea={handleSaveIdea}
          session={session}
          items={items}
        />
      )}

      {openItem && (
        <DetailModal
          item={openItem}
          session={session}
          onClose={() => setOpenItem(null)}
          onShare={() => { setShareItem(openItem); setOpenItem(null); }}
          onUpdated={fetchContent}
        />
      )}
      {shareItem && (
        <ShareModal
          item={shareItem}
          session={session}
          onClose={() => setShareItem(null)}
        />
      )}
      {uploadOpen && (
        <UploadModal
          session={session}
          onClose={() => setUploadOpen(false)}
          onUploaded={handleUploaded}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
