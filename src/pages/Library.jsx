import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const CONTENT_TYPES = ['deck', 'video', 'demo', 'doc', 'code'];

const TYPE_STYLE = {
  deck:  { bg: '#f3f4f6', color: '#374151' },
  video: { bg: '#f3f4f6', color: '#374151' },
  demo:  { bg: '#f3f4f6', color: '#374151' },
  doc:   { bg: '#f3f4f6', color: '#374151' },
  code:  { bg: '#f3f4f6', color: '#374151' },
};

function TypeBadge({ type }) {
  const st = TYPE_STYLE[type] || { bg: '#f0f0f0', color: '#555' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 10, background: st.bg, color: st.color,
      letterSpacing: '0.4px', textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}

function TagChip({ label }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 7px', borderRadius: 8,
      background: 'rgba(0,0,0,0.05)', color: '#6b7280',
      border: '1px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function StatPill({ icon, value, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9ca3af' }}>
      <span>{icon}</span>
      <span style={{ fontWeight: 600, color: '#374151' }}>{value}</span>
      {label && <span>{label}</span>}
    </span>
  );
}

function GridCard({ item }) {
  const [hovered, setHovered] = useState(false);
  const uploader = item.uploader;
  const date = new Date(item.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div
      style={{
        ...s.card,
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={s.cardTop}>
        <TypeBadge type={item.content_type} />
        <span style={s.cardDate}>{date}</span>
      </div>
      <h4 style={s.cardTitle}>{item.title}</h4>
      {item.description && (
        <p style={s.cardDesc}>{item.description}</p>
      )}
      <div style={s.cardTags}>
        {item.tags?.slice(0, 4).map(t => <TagChip key={t} label={t} />)}
        {item.tags?.length > 4 && (
          <span style={{ fontSize: 11, color: '#aaa' }}>+{item.tags.length - 4}</span>
        )}
      </div>
      <div style={s.cardFooter}>
        <div style={s.cardStats}>
          <StatPill icon="👁" value={item.view_count ?? 0} />
          <StatPill icon="↗" value={item.share_count ?? 0} />
        </div>
        {uploader && (
          <span style={s.cardUploader} title={uploader.email}>
            {uploader.name || uploader.email}
          </span>
        )}
      </div>
    </div>
  );
}

function ListRow({ item }) {
  const [hovered, setHovered] = useState(false);
  const uploader = item.uploader;
  const date = new Date(item.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div
      style={{
        ...s.listRow,
        background: hovered ? '#f9fafb' : '#ffffff',
        transition: 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ ...s.col, ...s.colTitle }}>
        <span style={s.listTitle} title={item.title}>{item.title}</span>
      </div>
      <div style={{ ...s.col, ...s.colType }}>
        <TypeBadge type={item.content_type} />
      </div>
      <div style={{ ...s.col, ...s.colUploader }}>
        <span style={s.uploaderText} title={uploader?.email}>
          {uploader?.name || uploader?.email || '—'}
        </span>
      </div>
      <div style={{ ...s.col, ...s.colDate }}>
        <span style={{ fontSize: 13, color: '#9ca3af' }}>{date}</span>
      </div>
      <div style={{ ...s.col, ...s.colStats }}>
        <span style={s.statNum}>{item.view_count ?? 0}</span>
      </div>
      <div style={{ ...s.col, ...s.colStats }}>
        <span style={s.statNum}>{item.share_count ?? 0}</span>
      </div>
      <div style={{ ...s.col, ...s.colTags }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
          {item.tags?.slice(0, 3).map(t => <TagChip key={t} label={t} />)}
          {item.tags?.length > 3 && (
            <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>+{item.tags.length - 3}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Library({ session, navigate }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid');

  // Filters
  const [search, setSearch]               = useState('');
  const [typeFilter, setTypeFilter]       = useState('');
  const [uploaderFilter, setUploaderFilter] = useState('');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [tagFilter, setTagFilter]         = useState('');
  const [sortBy, setSortBy]               = useState('newest');

  const user = session.user;

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const { data, error } = await supabase
        .from('content_items')
        .select(`
          id, title, description, content_type, tags,
          view_count, share_count, created_at, updated_at,
          file_url, is_external_url,
          uploader:users(id, name, email)
        `)
        .order('created_at', { ascending: false });

      if (!error) setItems(data || []);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const uploaders = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      if (item.uploader?.id) map.set(item.uploader.id, item.uploader);
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.name || a.email).localeCompare(b.name || b.email)
    );
  }, [items]);

  const allTags = useMemo(() => {
    const set = new Set();
    items.forEach(item => item.tags?.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.title?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        i.tags?.some(t => t.toLowerCase().includes(q))
      );
    }

    if (typeFilter) {
      result = result.filter(i => i.content_type === typeFilter);
    }

    if (uploaderFilter) {
      result = result.filter(i => i.uploader?.id === uploaderFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter(i => new Date(i.created_at) >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      result = result.filter(i => new Date(i.created_at) <= to);
    }

    if (tagFilter.trim()) {
      const tq = tagFilter.toLowerCase();
      result = result.filter(i => i.tags?.some(t => t.toLowerCase().includes(tq)));
    }

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':      return new Date(a.created_at) - new Date(b.created_at);
        case 'most_viewed': return (b.view_count ?? 0) - (a.view_count ?? 0);
        case 'most_shared': return (b.share_count ?? 0) - (a.share_count ?? 0);
        default:            return new Date(b.created_at) - new Date(a.created_at);
      }
    });
  }, [items, search, typeFilter, uploaderFilter, dateFrom, dateTo, tagFilter, sortBy]);

  const hasFilters = search || typeFilter || uploaderFilter || dateFrom || dateTo || tagFilter;

  const clearFilters = useCallback(() => {
    setSearch('');
    setTypeFilter('');
    setUploaderFilter('');
    setDateFrom('');
    setDateTo('');
    setTagFilter('');
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div style={s.page}>
      <style>{`
        .lib-ctrl::placeholder { color: #9ca3af; }
        .lib-ctrl:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .lib-ctrl::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
      `}</style>

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <strong style={s.logo}>SE Content Hub</strong>
          <nav style={s.nav}>
            <button style={s.navLink} onClick={() => navigate('dashboard')}>Dashboard</button>
            <button style={{ ...s.navLink, ...s.navLinkActive }}>Library</button>
            <button style={s.navLink} onClick={() => navigate('chat')}>Chat</button>
          </nav>
        </div>
        <div style={s.headerRight}>
          <span style={s.userBadge}>{user.user_metadata?.full_name || user.email}</span>
          <button style={s.uploadBtn} onClick={() => navigate('upload')}>+ Upload</button>
          <button style={s.signOutBtn} onClick={handleSignOut}>Sign Out</button>
        </div>
      </header>

      {/* ── Filter bar ── */}
      <div style={s.filterBar}>
        <div style={s.filterRow}>
          <input
            className="lib-ctrl"
            style={s.searchInput}
            placeholder="Search title, description, tags…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="lib-ctrl" style={s.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="lib-ctrl" style={s.select} value={uploaderFilter} onChange={e => setUploaderFilter(e.target.value)}>
            <option value="">All uploaders</option>
            {uploaders.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
          <div style={s.dateRange}>
            <input
              className="lib-ctrl"
              style={s.dateInput}
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="From date"
            />
            <span style={s.dateSep}>–</span>
            <input
              className="lib-ctrl"
              style={s.dateInput}
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              title="To date"
            />
          </div>
          <input
            className="lib-ctrl"
            style={s.tagInput}
            placeholder="Filter by tag…"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            list="tag-suggestions"
          />
          <datalist id="tag-suggestions">
            {allTags.map(t => <option key={t} value={t} />)}
          </datalist>
          {hasFilters && (
            <button style={s.clearBtn} onClick={clearFilters}>✕ Clear</button>
          )}
        </div>

        <div style={s.controlsRow}>
          <span style={s.resultCount}>
            {loading
              ? 'Loading…'
              : `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}${items.length !== filtered.length ? ` of ${items.length}` : ''}`
            }
          </span>
          <div style={s.sortRow}>
            <span style={s.sortLabel}>Sort:</span>
            <select className="lib-ctrl" style={s.select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most_viewed">Most viewed</option>
              <option value="most_shared">Most shared</option>
            </select>
          </div>
          <div style={s.viewToggle}>
            <button
              style={{ ...s.viewBtn, ...(viewMode === 'grid' ? s.viewBtnActive : {}) }}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <GridIcon />
            </button>
            <button
              style={{ ...s.viewBtn, ...(viewMode === 'list' ? s.viewBtnActive : {}) }}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <ListIcon />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <main style={s.main}>
        {loading && (
          <div style={s.centerMsg}>
            <span style={s.muted}>Loading content…</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>{hasFilters ? '🔍' : '🗂️'}</div>
            <p style={s.emptyTitle}>
              {hasFilters ? 'No content matches your filters' : 'No content uploaded yet'}
            </p>
            {hasFilters && (
              <button style={s.ctaBtn} onClick={clearFilters}>Clear filters</button>
            )}
            {!hasFilters && (
              <button style={s.ctaBtn} onClick={() => navigate('upload')}>+ Upload content</button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && viewMode === 'grid' && (
          <div style={s.grid}>
            {filtered.map(item => <GridCard key={item.id} item={item} />)}
          </div>
        )}

        {!loading && filtered.length > 0 && viewMode === 'list' && (
          <div style={s.listTable}>
            <div style={s.listHeader}>
              <div style={{ ...s.col, ...s.colTitle }}>Title</div>
              <div style={{ ...s.col, ...s.colType }}>Type</div>
              <div style={{ ...s.col, ...s.colUploader }}>Uploader</div>
              <div style={{ ...s.col, ...s.colDate }}>Uploaded</div>
              <div style={{ ...s.col, ...s.colStats }}>Views</div>
              <div style={{ ...s.col, ...s.colStats }}>Shares</div>
              <div style={{ ...s.col, ...s.colTags }}>Tags</div>
            </div>
            {filtered.map(item => <ListRow key={item.id} item={item} />)}
          </div>
        )}
      </main>
    </div>
  );
}

function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <rect x="1" y="2" width="13" height="2" rx="1" />
      <rect x="1" y="6.5" width="13" height="2" rx="1" />
      <rect x="1" y="11" width="13" height="2" rx="1" />
    </svg>
  );
}

// All colors are hardcoded for light-mode; colorScheme:'light' on the page wrapper
// forces browser-native controls (inputs, selects, date pickers) to match.
const CTRL = {
  height: 32,
  padding: '0 10px',
  fontSize: 13,
  fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: '#ffffff',
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  lineHeight: '1',
};

const s = {
  // ── Layout ──────────────────────────────────────────────────────────
  page: {
    fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
    minHeight: '100vh',
    background: '#f3f4f6',
    display: 'flex',
    flexDirection: 'column',
    colorScheme: 'light',   // forces all browser-native form elements to light mode
    color: '#111827',
  },

  // ── Header ──────────────────────────────────────────────────────────
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', height: 52, borderBottom: '1px solid #e5e7eb', background: '#ffffff', flexShrink: 0 },
  headerLeft:   { display: 'flex', alignItems: 'center', gap: 20 },
  logo:         { fontSize: 14, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' },
  nav:          { display: 'flex', gap: 2 },
  navLink:      { fontSize: 13, padding: '5px 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', borderRadius: 6, fontFamily: 'inherit' },
  navLinkActive:{ background: '#eff6ff', color: '#2563eb', fontWeight: 600 },
  headerRight:  { display: 'flex', alignItems: 'center', gap: 10 },
  userBadge:    { fontSize: 12, color: '#9ca3af' },
  uploadBtn:    { height: 30, padding: '0 12px', fontSize: 12, cursor: 'pointer', border: 'none', background: '#111827', color: '#ffffff', borderRadius: 6, fontFamily: 'inherit', fontWeight: 500 },
  signOutBtn:   { height: 30, padding: '0 10px', fontSize: 12, cursor: 'pointer', border: 'none', background: '#111827', color: '#ffffff', borderRadius: 6, fontFamily: 'inherit' },

  // ── Filter bar ──────────────────────────────────────────────────────
  filterBar:    { background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 },
  filterRow:    { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },

  // All form controls share CTRL as a base; spread it inline per element
  searchInput:  { ...CTRL, flex: '1 1 200px', minWidth: 140, padding: '0 10px' },
  select:       { ...CTRL, minWidth: 120, cursor: 'pointer', paddingRight: 8 },
  dateInput:    { ...CTRL, width: 132, cursor: 'pointer' },
  tagInput:     { ...CTRL, minWidth: 130 },

  dateRange:    { display: 'flex', alignItems: 'center', gap: 6 },
  dateSep:      { fontSize: 13, color: '#9ca3af', userSelect: 'none' },
  clearBtn:     { height: 32, padding: '0 10px', fontSize: 12, cursor: 'pointer', border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', borderRadius: 6, fontFamily: 'inherit', whiteSpace: 'nowrap', boxSizing: 'border-box' },

  // ── Controls row (count / sort / view toggle) ────────────────────────
  controlsRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  resultCount:  { fontSize: 12, color: '#9ca3af', flex: 1 },
  sortRow:      { display: 'flex', alignItems: 'center', gap: 8 },
  sortLabel:    { fontSize: 12, color: '#9ca3af' },
  viewToggle:   { display: 'flex', gap: 2 },
  viewBtn:      { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px solid #e5e7eb', borderRadius: 6, background: '#ffffff', cursor: 'pointer', color: '#9ca3af' },
  viewBtnActive:{ background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' },

  // ── Main ────────────────────────────────────────────────────────────
  main:         { flex: 1, padding: 24, boxSizing: 'border-box' },
  muted:        { color: '#9ca3af', fontSize: 13 },
  centerMsg:    { display: 'flex', justifyContent: 'center', padding: 60 },
  emptyState:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 24px' },
  emptyIcon:    { fontSize: 40 },
  emptyTitle:   { fontSize: 15, color: '#6b7280', margin: 0 },
  ctaBtn:       { height: 34, padding: '0 16px', fontSize: 13, cursor: 'pointer', border: 'none', background: '#111827', color: '#ffffff', borderRadius: 6, fontFamily: 'inherit', fontWeight: 500 },

  // ── Grid ────────────────────────────────────────────────────────────
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card:         { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'default' },
  cardTop:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardDate:     { fontSize: 11, color: '#d1d5db' },
  cardTitle:    { margin: 0, fontSize: 14, fontWeight: 600, color: '#111827', lineHeight: '1.35', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  cardDesc:     { margin: 0, fontSize: 12, color: '#6b7280', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 },
  cardTags:     { display: 'flex', gap: 5, flexWrap: 'wrap', minHeight: 20 },
  cardFooter:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: 10, marginTop: 2 },
  cardStats:    { display: 'flex', gap: 12 },
  cardUploader: { fontSize: 11, color: '#d1d5db', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // ── List ────────────────────────────────────────────────────────────
  listTable:    { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, overflowX: 'auto' },
  listHeader:   { display: 'flex', padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', minWidth: 700 },
  listRow:      { display: 'flex', padding: '11px 16px', borderBottom: '1px solid #f3f4f6', alignItems: 'center', minWidth: 700 },
  col:          { display: 'flex', alignItems: 'center', paddingRight: 12, boxSizing: 'border-box', overflow: 'hidden' },
  colTitle:     { flex: '1 1 220px', minWidth: 0 },
  colType:      { flex: '0 0 88px' },
  colUploader:  { flex: '0 0 140px' },
  colDate:      { flex: '0 0 105px' },
  colStats:     { flex: '0 0 58px', justifyContent: 'center' },
  colTags:      { flex: '1 1 140px', minWidth: 0 },
  listTitle:    { fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%' },
  uploaderText: { fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' },
  statNum:      { fontSize: 13, fontWeight: 500, color: '#374151' },
};
