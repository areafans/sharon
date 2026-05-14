import { useEffect, useMemo, useState } from 'react';
import { useLDClient, useFlags } from 'launchdarkly-react-client-sdk';
import { supabase } from './lib/supabase';
import { buildLDContext, applyContentAccess } from './lib/launchdarkly';
import Auth from './pages/Auth';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LibraryView from './components/LibraryView';
import IdeasView from './components/IdeasView';
import DetailModal from './components/DetailModal';
import IdeaModal from './components/IdeaModal';
import UploadModal from './components/UploadModal';
import ShareModal from './components/ShareModal';
import ChatView from './components/ChatView';
import AnalyticsView from './components/AnalyticsView';
import Toast from './components/Toast';

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
  const [openIdea, setOpenIdea] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Chat sessions — lifted from ChatView so the Sidebar can show the
  // conversation list across every view, not just when chat is active.
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState(null);

  // Notifications
  const [toasts, setToasts] = useState([]);

  // Data
  const [items, setItems] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // LaunchDarkly
  const ldClient = useLDClient();
  const flags = useFlags();
  const contentAccessFlag = flags['gallery-content-access'] ?? { mode: 'all' };

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

  // Identify user in LaunchDarkly after auth resolves
  useEffect(() => {
    if (!ldClient) return;
    ldClient.identify(buildLDContext(session)).catch(e =>
      console.warn('[LD] identify failed:', e)
    );
  }, [session?.user?.id, ldClient]);

  // Fetch data when authenticated
  useEffect(() => {
    if (!session) return;
    fetchContent();
    fetchIdeas();
    fetchChatSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function fetchChatSessions() {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at, updated_at')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false })
      .limit(40);
    setChatSessions(data || []);
  }

  // Lazily creates a session and switches to the chat view. `title` is
  // optional — ChatView updates it once the user sends their first message.
  async function createChatSession(title = 'New chat') {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ user_id: session.user.id, title })
      .select('id, title, created_at, updated_at')
      .single();
    if (error) { console.error('createChatSession:', error.message); return null; }
    setChatSessions(prev => [data, ...prev]);
    setActiveChatSessionId(data.id);
    return data;
  }

  async function deleteChatSession(id) {
    await supabase.from('chat_sessions').delete().eq('id', id);
    setChatSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (activeChatSessionId === id) setActiveChatSessionId(next[0]?.id ?? null);
      return next;
    });
  }

  async function touchChatSession(id) {
    const now = new Date().toISOString();
    await supabase.from('chat_sessions').update({ updated_at: now }).eq('id', id);
    setChatSessions(prev => prev
      .map(s => s.id === id ? { ...s, updated_at: now } : s)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    );
  }

  async function updateChatSessionTitle(id, title) {
    await supabase.from('chat_sessions').update({ title }).eq('id', id);
    setChatSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  }

  function selectChatSession(id) {
    setActiveChatSessionId(id);
    setView('chat');
  }

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

  // Apply LaunchDarkly content-access flag to filter gallery items.
  // The chat assistant receives the same filtered set, so it can only
  // surface content the current user is authorised to see.
  const visibleItems = useMemo(
    () => applyContentAccess(items, contentAccessFlag),
    [items, contentAccessFlag]
  );

  function toggleTag(tag) {
    if (tag === null) { setActiveTags([]); return; }
    setActiveTags(a => a.includes(tag) ? a.filter(x => x !== tag) : [...a, tag]);
  }

  function pushToast(msg, icon = 'check') {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, msg, icon }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 2600);
  }

  async function handleDeleteContent(id) {
    // Optimistic update — remove immediately so the UI feels instant
    setItems(prev => prev.filter(x => x.id !== id));
    if (openItem?.id === id) setOpenItem(null);

    const { error } = await supabase.from('content_items').delete().eq('id', id);
    if (error) {
      // Roll back the optimistic removal and surface the error
      fetchContent();
      pushToast(`Delete failed: ${error.message}`, 'error');
    } else {
      pushToast('Item deleted from library', 'check');
    }
  }

  function handleUploaded() {
    fetchContent();
    ldClient?.track('content-item-uploaded');
    pushToast('Added · embedding generated — discoverable in chat', 'ai');
  }

  if (authLoading) {
    return (
      <div className="loading-screen">
        <img className="brand-mark" src="/sharon-logo.png" alt="Sharon" />
        <div className="thinking"><span /><span /><span /></div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="app">
      <Sidebar
        view={view}
        onNav={setView}
        onUpload={() => setUploadOpen(true)}
        activeTags={activeTags}
        onToggleTag={toggleTag}
        items={visibleItems}
        ideas={ideas}
        session={session}
        chatSessions={chatSessions}
        activeChatSessionId={activeChatSessionId}
        onSelectChat={selectChatSession}
        onNewChat={async () => {
          await createChatSession();
          setView('chat');
        }}
        onDeleteChat={deleteChatSession}
      />

      <main className="main">
        <TopBar
          view={view}
          search={search}
          onSearch={setSearch}
          onNew={async () => {
            if (view === 'library') {
              setUploadOpen(true);
            } else if (view === 'ideas') {
              await createChatSession();
              setView('chat');
            }
          }}
          theme={theme}
          onTheme={setTheme}
        />
        {view === 'library' && (
          <LibraryView
            items={visibleItems}
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
            onOpenContent={(item) => {
              ldClient?.track('content-item-opened', {
                contentType: item.content_type,
                tags: item.tags || [],
                flagVariation: contentAccessFlag?.mode ?? 'all',
              });
              setOpenItem(item);
            }}
            onDeleteContent={handleDeleteContent}
          />
        )}
        {view === 'ideas' && (
          <IdeasView
            ideas={ideas}
            onOpenContent={setOpenItem}
            onOpenIdea={setOpenIdea}
            onNewIdea={async () => {
              await createChatSession();
              setView('chat');
            }}
            session={session}
            onIdeaUpdated={fetchIdeas}
          />
        )}
        {view === 'chat' && (
          <ChatView
            session={session}
            items={visibleItems}
            onOpenContent={setOpenItem}
            activeChatSessionId={activeChatSessionId}
            onCreateChat={createChatSession}
            onTouchChat={touchChatSession}
            onUpdateChatTitle={updateChatSessionTitle}
          />
        )}
        {view === 'analytics' && (
          <AnalyticsView
            items={visibleItems}
            ideas={ideas}
            session={session}
          />
        )}
      </main>

      {openItem && (
        <DetailModal
          item={openItem}
          session={session}
          onClose={() => setOpenItem(null)}
          onShare={() => { setShareItem(openItem); setOpenItem(null); }}
          onUpdated={fetchContent}
        />
      )}
      {openIdea && (
        <IdeaModal
          idea={openIdea}
          onClose={() => setOpenIdea(null)}
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
