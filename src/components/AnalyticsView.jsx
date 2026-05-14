import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import Icons from './Icons';
import Avatar from './Avatar';

const DATE_LABELS = { all: 'All time', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' };
const DATE_CUTOFF_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

const TYPE_COLORS = {
  deck: 'var(--t-deck)',
  video: 'var(--t-video)',
  demo: 'var(--t-demo)',
  doc: 'var(--t-doc)',
  code: 'var(--t-code)',
};
const TYPE_LABELS = { deck: 'Decks', video: 'Videos', demo: 'Demos', doc: 'Docs', code: 'Code' };

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="analytics-stat-card">
      <div className="analytics-stat-icon">{icon}</div>
      <div className="analytics-stat-value">{value}</div>
      <div className="analytics-stat-label">{label}</div>
      {sub && <div className="analytics-stat-sub">{sub}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="analytics-tooltip">
      <div className="analytics-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="analytics-tooltip-row">
          <span className="analytics-tooltip-dot" style={{ background: p.fill || p.color }} />
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div className="analytics-section-header">
      <div className="analytics-section-title">{title}</div>
      {sub && <div className="analytics-section-sub">{sub}</div>}
    </div>
  );
}

export default function AnalyticsView({ items, ideas, session }) {
  const [dateFilter, setDateFilter] = useState('all');
  const [uploaderFilter, setUploaderFilter] = useState('all');

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

  // Same refreshable-time-anchor pattern as LibraryView — see the comment
  // there for why the `setTimeout(…, 0)` is necessary to satisfy both
  // `react-hooks/purity` and `react-hooks/set-state-in-effect`.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, [dateFilter]);

  const filtered = useMemo(() => {
    const cutoffDays = DATE_CUTOFF_DAYS[dateFilter];
    const cutoff = cutoffDays ? new Date(now - cutoffDays * 24 * 60 * 60 * 1000) : null;
    return items.filter(item => {
      if (cutoff && new Date(item.created_at) < cutoff) return false;
      if (uploaderFilter === 'mine') {
        return item.uploader?.id === session?.user?.id;
      } else if (uploaderFilter !== 'all') {
        return item.uploader?.id === uploaderFilter;
      }
      return true;
    });
  }, [items, dateFilter, uploaderFilter, session, now]);

  // Summary stats
  const totalViews = filtered.reduce((s, i) => s + (i.view_count || 0), 0);
  const totalShares = filtered.reduce((s, i) => s + (i.share_count || 0), 0);
  const ratedItems = filtered.filter(i => i.rating_count > 0);
  const avgRating = ratedItems.length
    ? (ratedItems.reduce((s, i) => s + i.avg_rating, 0) / ratedItems.length).toFixed(1)
    : '—';

  // Upload timeline — group by month (or week for short ranges)
  const timelineData = useMemo(() => {
    const useWeeks = dateFilter === '7d' || dateFilter === '30d';
    const counts = {};
    filtered.forEach(item => {
      const d = new Date(item.created_at);
      let key;
      if (useWeeks) {
        // group by day
        key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        key = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      }
      counts[key] = (counts[key] || 0) + 1;
    });

    // Sort chronologically
    const sorted = Object.entries(counts).sort((a, b) => {
      return new Date(a[0]) - new Date(b[0]);
    });
    return sorted.map(([period, uploads]) => ({ period, uploads }));
  }, [filtered, dateFilter]);

  // Content type breakdown
  const typeData = useMemo(() => {
    const counts = {};
    filtered.forEach(item => {
      counts[item.content_type] = (counts[item.content_type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, label: TYPE_LABELS[type] || type, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Top uploaders
  const uploaderData = useMemo(() => {
    const counts = {};
    const meta = {};
    filtered.forEach(item => {
      if (!item.uploader) return;
      const id = item.uploader.id;
      counts[id] = (counts[id] || 0) + 1;
      meta[id] = item.uploader;
    });
    return Object.entries(counts)
      .map(([id, count]) => ({ id, count, uploader: meta[id] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

  // Top tags
  const tagData = useMemo(() => {
    const counts = {};
    filtered.forEach(item => item.tags?.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [filtered]);

  // Views + shares by uploader
  const engagementData = useMemo(() => {
    const data = {};
    filtered.forEach(item => {
      if (!item.uploader) return;
      const id = item.uploader.id;
      if (!data[id]) data[id] = { id, name: item.uploader.name || item.uploader.email?.split('@')[0], views: 0, shares: 0 };
      data[id].views += item.view_count || 0;
      data[id].shares += item.share_count || 0;
    });
    return Object.values(data)
      .sort((a, b) => (b.views + b.shares) - (a.views + a.shares))
      .slice(0, 8);
  }, [filtered]);

  const hasFilters = dateFilter !== 'all' || uploaderFilter !== 'all';

  return (
    <div className="analytics">
      <div className="library-header">
        <div className="library-title-row">
          <div>
            <div className="page-sub">Analytics · {filtered.length} items</div>
            <h1 className="page-title">Content performance & insights</h1>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar analytics-filter-bar">
        <div className="filter-selects">
          <div className="filter-select-item">
            <span>Period</span>
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
              {Object.entries(DATE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <Icons.ChevronDown size={12} />
          </div>

          <div className="filter-select-item">
            <span>By</span>
            <select value={uploaderFilter} onChange={e => setUploaderFilter(e.target.value)}>
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

          {hasFilters && (
            <button className="filter-clear-btn" onClick={() => { setDateFilter('all'); setUploaderFilter('all'); }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="analytics-body">
        {/* Summary stats */}
        <div className="analytics-stats-row">
          <StatCard
            icon={<Icons.Library size={16} />}
            value={filtered.length}
            label="Total items"
            sub={`of ${items.length} total`}
          />
          <StatCard
            icon={<Icons.Eye size={16} />}
            value={totalViews.toLocaleString()}
            label="Total views"
          />
          <StatCard
            icon={<Icons.Share size={16} />}
            value={totalShares.toLocaleString()}
            label="Total shares"
          />
          <StatCard
            icon={<Icons.Star size={16} filled={false} />}
            value={avgRating}
            label="Avg rating"
            sub={ratedItems.length ? `${ratedItems.length} rated` : 'no ratings yet'}
          />
          <StatCard
            icon={<Icons.Bulb size={16} />}
            value={ideas.length}
            label="Ideas generated"
          />
        </div>

        {/* Row 1: Timeline + Type breakdown */}
        <div className="analytics-grid-2">
          <div className="analytics-card">
            <SectionHeader
              title="Upload timeline"
              sub={timelineData.length === 0 ? 'No data' : `${filtered.length} uploads`}
            />
            {timelineData.length > 0 ? (
              <div className="analytics-chart-wrap">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={timelineData} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 11, fill: 'var(--muted)', fontFamily: 'var(--font-mono)' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted)', fontFamily: 'var(--font-mono)' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={28}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--line)', opacity: 0.6 }} />
                    <Bar dataKey="uploads" name="Uploads" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="analytics-empty">No uploads in this period</div>
            )}
          </div>

          <div className="analytics-card">
            <SectionHeader title="Content by type" sub={`${typeData.length} types`} />
            {typeData.length > 0 ? (
              <div className="analytics-type-list">
                {typeData.map(({ type, label, count }) => {
                  const pct = filtered.length ? Math.round((count / filtered.length) * 100) : 0;
                  return (
                    <div key={type} className="analytics-type-row">
                      <div className="analytics-type-label">
                        <span className="analytics-type-dot" style={{ background: TYPE_COLORS[type] }} />
                        {label}
                      </div>
                      <div className="analytics-type-bar-wrap">
                        <div
                          className="analytics-type-bar"
                          style={{ width: `${pct}%`, background: TYPE_COLORS[type] }}
                        />
                      </div>
                      <div className="analytics-type-count">{count}</div>
                      <div className="analytics-type-pct">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="analytics-empty">No content in this period</div>
            )}
          </div>
        </div>

        {/* Row 2: Top uploaders + Top tags */}
        <div className="analytics-grid-2">
          <div className="analytics-card">
            <SectionHeader title="Uploads by person" sub="Who's contributing the most" />
            {uploaderData.length > 0 ? (
              <div className="analytics-uploader-list">
                {uploaderData.map(({ id, count, uploader }) => {
                  const pct = filtered.length ? Math.round((count / filtered.length) * 100) : 0;
                  const maxCount = uploaderData[0]?.count || 1;
                  const barPct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={id} className="analytics-uploader-row">
                      <div className="analytics-uploader-identity">
                        <Avatar user={uploader} size="xs" />
                        <div className="analytics-uploader-name">
                          {uploader.name || uploader.email?.split('@')[0]}
                        </div>
                      </div>
                      <div className="analytics-type-bar-wrap">
                        <div
                          className="analytics-type-bar"
                          style={{ width: `${barPct}%`, background: 'var(--forest)' }}
                        />
                      </div>
                      <div className="analytics-type-count">{count}</div>
                      <div className="analytics-type-pct">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="analytics-empty">No uploads in this period</div>
            )}
          </div>

          <div className="analytics-card">
            <SectionHeader title="Top tags" sub={`${tagData.length} tags in use`} />
            {tagData.length > 0 ? (
              <div className="analytics-tag-list">
                {tagData.map(({ tag, count }) => {
                  const maxCount = tagData[0]?.count || 1;
                  const barPct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={tag} className="analytics-tag-row">
                      <div className="analytics-tag-pill">{tag}</div>
                      <div className="analytics-type-bar-wrap">
                        <div
                          className="analytics-type-bar"
                          style={{ width: `${barPct}%`, background: 'var(--gold)' }}
                        />
                      </div>
                      <div className="analytics-type-count">{count}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="analytics-empty">No tags in this period</div>
            )}
          </div>
        </div>

        {/* Row 3: Engagement by person */}
        {engagementData.length > 0 && (
          <div className="analytics-card analytics-card-wide">
            <SectionHeader title="Views & shares by contributor" sub="Engagement generated per person" />
            <div className="analytics-chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={engagementData} barGap={4} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'var(--muted)', fontFamily: 'var(--font-mono)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--muted)', fontFamily: 'var(--font-mono)' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={34}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--line)', opacity: 0.6 }} />
                  <Bar dataKey="views" name="Views" fill="var(--t-doc)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="shares" name="Shares" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
