import Icons from './Icons';

const NEW_BUTTON_LABELS = {
  library: 'New',
  ideas:   'New idea',
};

export default function TopBar({ view, search, onSearch, onNew, theme, onTheme }) {
  const newLabel = NEW_BUTTON_LABELS[view];

  return (
    <div className="topbar">
      <div className="search-input">
        <Icons.Search size={15} stroke="currentColor" />
        <input
          placeholder="Search the hub — titles, tags, descriptions…"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
        <span className="kbd">⌘K</span>
      </div>
      <div className="spacer" />
      <div className="theme-toggle" role="group" aria-label="Theme">
        <button
          className={theme === 'light' ? 'active' : ''}
          onClick={() => onTheme('light')}
          aria-label="Light mode"
          title="Light mode"
        >
          <Icons.Sun size={14} />
        </button>
        <button
          className={theme === 'dark' ? 'active' : ''}
          onClick={() => onTheme('dark')}
          aria-label="Dark mode"
          title="Dark mode"
        >
          <Icons.Moon size={14} />
        </button>
      </div>
      {newLabel && (
        <button className="btn btn-secondary btn-sm" onClick={onNew}>
          <Icons.Plus size={14} /> {newLabel}
        </button>
      )}
    </div>
  );
}
