/* global React, ReactDOM, Sidebar, TopBar, Library, IdeasView, DetailModal, UploadModal, ShareModal, ChatPanel, Toast, SEED_CHAT, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakColor */
const { useState, useEffect, useMemo } = React;

const DEFAULT_TWEAKS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "accent": "#C2410C",
  "chatAlwaysOpen": true,
  "showPosterText": false,
  "theme": "dark"
}/*EDITMODE-END*/;

function App() {
  const [view, setView] = useState('library');
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [openItem, setOpenItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [t, setTweak] = useTweaks(DEFAULT_TWEAKS);

  // Apply tweaks
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
    // derive accent-deep + accent-soft
    document.documentElement.style.setProperty('--accent-deep', shade(t.accent, -25));
    document.documentElement.style.setProperty('--accent-soft', tint(t.accent, 88));
  }, [t.accent]);

  useEffect(() => {
    if (t.density === 'compact') {
      document.body.style.fontSize = '13px';
    } else {
      document.body.style.fontSize = '14px';
    }
  }, [t.density]);

  useEffect(() => { setChatCollapsed(!t.chatAlwaysOpen); }, [t.chatAlwaysOpen]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.theme);
  }, [t.theme]);

  const toggleTag = (tag) => {
    if (tag === null) { setActiveTags([]); return; }
    setActiveTags(a => a.includes(tag) ? a.filter(x => x !== tag) : [...a, tag]);
  };

  const pushToast = (msg, icon) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, msg, icon }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 2400);
  };

  const handleSaveIdea = () => {
    pushToast('Saved to Ideas — visible to the team', 'check');
  };

  const handleUploaded = (data) => {
    pushToast(`Added · embedding generated — discoverable in chat`, 'ai');
  };

  return (
    <div className={`app ${chatCollapsed ? 'chat-collapsed' : ''}`}>
      <Sidebar
        view={view}
        onNav={setView}
        onUpload={() => setUploadOpen(true)}
        activeTags={activeTags}
        onToggleTag={toggleTag}
      />

      <main className="main">
        <TopBar
          search={search}
          onSearch={setSearch}
          onUpload={() => setUploadOpen(true)}
          theme={t.theme}
          onTheme={(v) => setTweak('theme', v)}
        />
        {view === 'library' ? (
          <Library
            search={search}
            activeTags={activeTags}
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
            sort={sort}
            onSort={setSort}
            onOpenContent={setOpenItem}
          />
        ) : (
          <IdeasView onOpenContent={setOpenItem}/>
        )}
      </main>

      <ChatPanel
        collapsed={chatCollapsed}
        onToggle={() => setChatCollapsed(c => !c)}
        onOpenContent={setOpenItem}
        onSaveIdea={handleSaveIdea}
        initialMessages={SEED_CHAT}
      />

      {openItem && <DetailModal item={openItem} onClose={() => setOpenItem(null)} onShare={() => { setShareItem(openItem); setOpenItem(null); }}/>}
      {shareItem && <ShareModal item={shareItem} onClose={() => setShareItem(null)}/>}
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onUploaded={handleUploaded}/>}

      <Toast toasts={toasts}/>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Density">
          <TweakRadio
            value={t.density}
            onChange={v => setTweak('density', v)}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </TweakSection>

        <TweakSection title="Accent color">
          <TweakColor
            value={t.accent}
            onChange={v => setTweak('accent', v)}
            options={['#C2410C', '#1F4E3D', '#2F4B7A', '#1A1A18']}
          />
        </TweakSection>

        <TweakSection title="Chat panel default">
          <TweakToggle
            value={t.chatAlwaysOpen}
            onChange={v => setTweak('chatAlwaysOpen', v)}
            label="Always open"
          />
        </TweakSection>

        <TweakSection title="Poster style">
          <TweakToggle
            value={t.showPosterText}
            onChange={v => setTweak('showPosterText', v)}
            label="Show title on poster"
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

/* color utilities */
function hexToRgb(h) {
  const x = h.replace('#', '');
  return [parseInt(x.slice(0,2), 16), parseInt(x.slice(2,4), 16), parseInt(x.slice(4,6), 16)];
}
function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function shade(hex, percent) {
  const [r,g,b] = hexToRgb(hex);
  const f = (percent < 0 ? 0 : 255), t = percent < 0 ? percent * -1 / 100 : percent / 100;
  return rgbToHex(r + (f - r) * t, g + (f - g) * t, b + (f - b) * t);
}
function tint(hex, percent) {
  return shade(hex, percent);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
