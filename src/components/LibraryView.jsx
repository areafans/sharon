import { useEffect, useMemo, useState } from 'react';
import Icons from './Icons';
import ContentCard from './ContentCard';

const TYPE_KEYS = ['all', 'deck', 'video', 'demo', 'doc', 'code'];
const TYPE_LABELS = { all: 'All', deck: 'Decks', video: 'Videos', demo: 'Demos', doc: 'Docs', code: 'Code' };

const DATE_CUTOFF_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const DATE_LABELS = { all: 'All time', '7d': 'This week', '30d': 'This month', '90d': 'Last 3 months' };

export default function LibraryView({
  items, loading, search, activeTags,
  typeFilter, onTypeFilter,
  sort, onSort,
  dateFilter, onDateFilter,
  uploaderFilter, onUploaderFilter,
  session,
  onOpenContent,
  onDeleteContent,
}) {
  const uploaders = useMemo(() => {
    const seen = new Set();
    const result = [];
    items.forEach(item => {
      if (item.uploader && !seen.has(item.uploader.id)) {
        seen.add(item.uploader.id);
        result.push(item.uploader);
      }
    });
    return result.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  }, [items]);

  // `Date.now()` is impure during render (`react-hooks/purity`) and a
  // synchronous `setNow(Date.now())` inside a `useEffect` body trips
  // `react-hooks/set-state-in-effect`. The pattern in the React docs for
  // a refreshable time anchor is `useState(() => Date.now())` plus a
  // setState inside an async callback (see the Clock example on
  // https://react.dev/reference/eslint-plugin-react-hooks/lints/purity).
  // We follow the same shape: schedule the refresh on the next tick, so
  // the setState is in a callback rather than synchronously in the body.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, [dateFilter]);

  const filtered = useMemo(() => {
    const cutoffDays = DATE_CUTOFF_DAYS[dateFilter];
    const cutoff = cutoffDays ? new Date(now - cutoffDays * 24 * 60 * 60 * 1000) : null;

    return items.filter(item => {
      if (typeFilter !== 'all' && item.content_type !== typeFilter) return false;
      if (activeTags.length > 0 && !activeTags.every(t => item.tags?.includes(t))) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const upName = (item.uploader?.name || item.uploader?.email || '').toLowerCase();
        const hay = `${item.title} ${item.description || ''} ${(item.tags || []).join(' ')} ${upName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (cutoff && new Date(item.created_at) < cutoff) return false;
      if (uploaderFilter === 'mine') {
        if (item.uploader?.id !== session?.user?.id) return false;
      } else if (uploaderFilter !== 'all') {
        if (item.uploader?.id !== uploaderFilter) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sort === 'rating') return (b.avg_rating ?? 0) - (a.avg_rating ?? 0);
      if (sort === 'views') return (b.view_count ?? 0) - (a.view_count ?? 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [items, search, activeTags, typeFilter, sort, dateFilter, uploaderFilter, session, now]);

  const typeCounts = useMemo(() => {
    // Compute counts from items after applying all active filters EXCEPT typeFilter,
    // so each pill shows how many items of that type exist within the current context.
    const cutoffDays = DATE_CUTOFF_DAYS[dateFilter];
    const cutoff = cutoffDays ? new Date(now - cutoffDays * 24 * 60 * 60 * 1000) : null;

    const base = items.filter(item => {
      if (activeTags.length > 0 && !activeTags.every(t => item.tags?.includes(t))) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const upName = (item.uploader?.name || item.uploader?.email || '').toLowerCase();
        const hay = `${item.title} ${item.description || ''} ${(item.tags || []).join(' ')} ${upName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (cutoff && new Date(item.created_at) < cutoff) return false;
      if (uploaderFilter === 'mine') {
        if (item.uploader?.id !== session?.user?.id) return false;
      } else if (uploaderFilter !== 'all') {
        if (item.uploader?.id !== uploaderFilter) return false;
      }
      return true;
    });

    const c = { all: base.length };
    ['deck', 'video', 'demo', 'doc', 'code'].forEach(t => {
      c[t] = base.filter(x => x.content_type === t).length;
    });
    return c;
  }, [items, search, activeTags, dateFilter, uploaderFilter, session, now]);

  const [layout, setLayout] = useState('grid');

  const hasSecondaryFilters = dateFilter !== 'all' || uploaderFilter !== 'all';

  function clearSecondaryFilters() {
    onDateFilter('all');
    onUploaderFilter('all');
  }

  const anyFilterActive = search || activeTags.length > 0 || typeFilter !== 'all' || dateFilter !== 'all' || uploaderFilter !== 'all';

  return (
    <div className="library">
      <div className="library-header">
        <div className="library-title-row">
          <div>
            <div className="page-sub">Library · {filtered.length} of {items.length}</div>
            <h1 className="page-title">Everything the team has made</h1>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="type-pills">
          {TYPE_KEYS.map(k => (
            <button
              key={k}
              className={`type-pill ${typeFilter === k ? 'active' : ''}`}
              onClick={() => onTypeFilter(k)}
            >
              {TYPE_LABELS[k]}
              <span className="count">{typeCounts[k] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="filter-selects">
          <div className="filter-select-item">
            <span>Date</span>
            <select value={dateFilter} onChange={e => onDateFilter(e.target.value)}>
              {Object.entries(DATE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <Icons.ChevronDown size={12} />
          </div>

          <div className="filter-select-item">
            <span>By</span>
            <select value={uploaderFilter} onChange={e => onUploaderFilter(e.target.value)}>
              <option value="all">Everyone</option>
              <option value="mine">My uploads</option>
              {uploaders.length > 1 && (
                <optgroup label="Team members">
                  {uploaders.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <Icons.ChevronDown size={12} />
          </div>

          {hasSecondaryFilters && (
            <button className="filter-clear-btn" onClick={clearSecondaryFilters}>
              Clear
            </button>
          )}
        </div>

        <div className="sort-control">
          Sort:
          <select value={sort} onChange={e => onSort(e.target.value)}>
            <option value="recent">Most recent</option>
            <option value="rating">Top rated</option>
            <option value="views">Most viewed</option>
          </select>
          <Icons.ChevronDown size={12} />
        </div>

        <div className="view-toggle">
          <button
            className={layout === 'grid' ? 'active' : ''}
            onClick={() => setLayout('grid')}
            title="Grid view"
          >
            <Icons.Grid size={14} />
          </button>
          <button
            className={layout === 'list' ? 'active' : ''}
            onClick={() => setLayout('list')}
            title="List view"
          >
            <Icons.List size={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Loading content…
        </div>
      ) : (
        <div className={layout === 'grid' ? 'content-grid' : 'content-list'}>
          {filtered.map(item => (
            <ContentCard
              key={item.id}
              item={item}
              layout={layout}
              onOpen={() => onOpenContent(item)}
              onDelete={onDeleteContent}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 60, textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              {anyFilterActive
                ? 'Nothing matches those filters. Try clearing one — or ask the assistant.'
                : 'No content yet. Upload the first item to get started.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
