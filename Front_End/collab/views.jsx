/* global React, Icons, TYPE_META, USERS, CONTENT, TAG_FREQ, POPULAR_TAGS, IDEAS, Avatar, Stars, StarsInput, Poster, userById, contentById */
const { useState: useStateV, useMemo: useMemoV, useEffect: useEffectV } = React;

/* ──────────────────────────────────────────────────────
   Sidebar
   ────────────────────────────────────────────────────── */
const Sidebar = ({ view, onNav, onUpload, activeTags, onToggleTag, typeCounts }) => {
  const meCount = CONTENT.filter(c => c.uploader === 'mp').length;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SE</div>
        <div className="brand-name">Content Hub<small>Solutions Engineering</small></div>
      </div>

      <div className="nav-section">
        <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => onNav('library')}>
          <span className="nav-icon"><Icons.Library size={16}/></span>
          Library
          <span className="nav-count">{CONTENT.length}</span>
        </button>
        <button className={`nav-item ${view === 'ideas' ? 'active' : ''}`} onClick={() => onNav('ideas')}>
          <span className="nav-icon"><Icons.Bulb size={16}/></span>
          Ideas
          <span className="nav-count">{IDEAS.length}</span>
        </button>
        <button className="nav-item" onClick={() => onNav('library')}>
          <span className="nav-icon"><Icons.Activity size={16}/></span>
          Activity
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-label">Tags</div>
        <button className={`tag-item ${activeTags.length === 0 ? 'active' : ''}`} onClick={() => onToggleTag(null)}>
          <span className="tag-dot"></span>All content<span className="tag-count">{CONTENT.length}</span>
        </button>
        {POPULAR_TAGS.map(t => {
          const count = CONTENT.filter(c => c.tags.includes(t)).length;
          return (
            <button key={t} className={`tag-item ${activeTags.includes(t) ? 'active' : ''}`} onClick={() => onToggleTag(t)}>
              <span className="tag-dot"></span>{t}<span className="tag-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="nav-section">
        <button className="btn btn-accent" style={{ justifyContent: 'center', width: '100%', padding: '9px 12px' }} onClick={onUpload}>
          <Icons.Upload size={14}/> Upload content
        </button>
      </div>

      <div className="user-card">
        <Avatar user={USERS.mp} size="sm"/>
        <div>
          <div className="user-name">Maya Park</div>
          <div className="user-role">Sr. Solutions Eng</div>
        </div>
        <div style={{ marginLeft: 'auto' }}><Icons.Settings size={14} stroke="var(--muted)"/></div>
      </div>
    </aside>
  );
};

/* ──────────────────────────────────────────────────────
   Top bar (search)
   ────────────────────────────────────────────────────── */
const TopBar = ({ search, onSearch, onUpload, theme, onTheme }) => (
  <div className="topbar">
    <div className="search-input">
      <Icons.Search size={15} stroke="currentColor"/>
      <input
        placeholder="Search the hub — titles, tags, descriptions…"
        value={search}
        onChange={e => onSearch(e.target.value)}
      />
      <span className="kbd">⌘K</span>
    </div>
    <div className="spacer"/>
    <button className="btn btn-ghost btn-sm">
      <Icons.Activity size={14}/> Activity
    </button>
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        className={theme === 'light' ? 'active' : ''}
        onClick={() => onTheme('light')}
        aria-label="Light mode"
        title="Light mode"
      >
        <Icons.Sun size={14}/>
      </button>
      <button
        className={theme === 'dark' ? 'active' : ''}
        onClick={() => onTheme('dark')}
        aria-label="Dark mode"
        title="Dark mode"
      >
        <Icons.Moon size={14}/>
      </button>
    </div>
    <button className="btn btn-secondary btn-sm" onClick={onUpload}>
      <Icons.Plus size={14}/> New
    </button>
  </div>
);

/* ──────────────────────────────────────────────────────
   Library view
   ────────────────────────────────────────────────────── */
const Library = ({ search, activeTags, typeFilter, onTypeFilter, sort, onSort, onOpenContent }) => {
  const filtered = useMemoV(() => {
    return CONTENT.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (activeTags.length > 0 && !activeTags.every(t => c.tags.includes(t))) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = (c.title + ' ' + c.desc + ' ' + c.tags.join(' ') + ' ' + USERS[c.uploader].name).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sort === 'rating') return b.rating - a.rating;
      if (sort === 'views') return b.views - a.views;
      return 0; // recent (default order)
    });
  }, [search, activeTags, typeFilter, sort]);

  const typeCounts = useMemoV(() => {
    const c = { all: CONTENT.length };
    ['deck','video','demo','doc','code'].forEach(t => { c[t] = CONTENT.filter(x => x.type === t).length; });
    return c;
  }, []);

  return (
    <div className="library">
      <div className="library-header">
        <div className="library-title-row">
          <div>
            <div className="page-sub">Library · {filtered.length} of {CONTENT.length}</div>
            <h1 className="page-title">Everything the team has made</h1>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="type-pills">
          {[
            { k: 'all', label: 'All' },
            { k: 'deck', label: 'Decks' },
            { k: 'video', label: 'Videos' },
            { k: 'demo', label: 'Demos' },
            { k: 'doc', label: 'Docs' },
            { k: 'code', label: 'Code' },
          ].map(t => (
            <button key={t.k} className={`type-pill ${typeFilter === t.k ? 'active' : ''}`} onClick={() => onTypeFilter(t.k)}>
              {t.label} <span className="count">{typeCounts[t.k]}</span>
            </button>
          ))}
        </div>

        <div className="sort-control">
          Sort:
          <select value={sort} onChange={e => onSort(e.target.value)}>
            <option value="recent">Most recent</option>
            <option value="rating">Top rated</option>
            <option value="views">Most viewed</option>
          </select>
          <Icons.ChevronDown size={12}/>
        </div>
      </div>

      <div className="content-grid">
        {filtered.map(item => (
          <ContentCard key={item.id} item={item} onOpen={() => onOpenContent(item)} />
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
            Nothing matches those filters. Try clearing one — or ask the assistant.
          </div>
        )}
      </div>
    </div>
  );
};

const ContentCard = ({ item, onOpen }) => {
  const meta = TYPE_META[item.type];
  const uploader = USERS[item.uploader];
  return (
    <div className="content-card" onClick={onOpen}>
      <Poster item={item} />
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        <div className="card-desc">{item.desc}</div>
        <div className="card-tags">
          {item.tags.slice(0, 3).map(t => <span key={t} className="chip">{t}</span>)}
          {item.tags.length > 3 && <span className="chip">+{item.tags.length - 3}</span>}
        </div>
      </div>
      <div className="card-footer">
        <Avatar user={uploader} size="sm"/>
        <span className="uploader-name">{uploader.name.split(' ')[0]} {uploader.name.split(' ')[1][0]}.</span>
        <span className="dot"></span>
        <span className="meta">{item.created}</span>
        <div style={{ marginLeft: 'auto' }} className="row">
          <span className="meta rating"><Icons.Star size={11} filled stroke="var(--gold)" fill="var(--gold)"/> {item.rating}</span>
          <span className="dot"></span>
          <span className="meta"><Icons.Eye size={11}/> {item.views}</span>
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   Detail modal
   ────────────────────────────────────────────────────── */
const DetailModal = ({ item, onClose, onShare }) => {
  const [userRating, setUserRating] = useStateV(0);
  const [commentText, setCommentText] = useStateV('');
  const uploader = USERS[item.uploader];
  const meta = TYPE_META[item.type];

  const seedComments = [
    {
      id: 'cm1', author: 'jt', time: '1 day ago',
      body: "Used this on the Lockwell call yesterday — the threat-model section landed especially well. One thing: slide 14's diagram is starting to feel dated, the new ML pipeline isn't reflected.",
      replies: [
        { id: 'cm1a', author: 'mp', time: '22 hours ago', body: "Good catch. Will update once Reza's team finalizes the v3 architecture diagram — should be next week." }
      ],
    },
    {
      id: 'cm2', author: 'rn', time: '3 days ago',
      body: "Repurposed slides 22-26 for the FedRAMP deal. Worked well with light edits.",
      replies: [],
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button className="modal-close" onClick={onClose}><Icons.Close size={16}/></button>
      <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
        <div className="detail-grid">
          <div className="detail-main">
            <div className="detail-type-row">
              <span className="type-dot" style={{ background: meta.color }}></span>
              <meta.icon size={13} stroke={meta.color}/> {meta.label}
              {item.slides && <> · {item.slides} slides</>}
              {item.runtime && <> · {item.runtime}</>}
              {item.isExternal && <> · External · {item.source}</>}
            </div>
            <h1 className="detail-title">{item.title}</h1>
            <p className="detail-desc">{item.desc}</p>

            <div className="detail-preview">
              <Poster item={item} showText={true} />
              <div className="preview-actions">
                <span>Preview · {item.isExternal ? `via ${item.source}` : 'Supabase Storage'}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm">
                    {item.isExternal ? <Icons.ExternalLink size={13}/> : <Icons.Download size={13}/>}
                    {item.isExternal ? 'Open in ' + item.source : 'Download'}
                  </button>
                  <button className="btn btn-primary btn-sm">
                    <Icons.Eye size={13}/> Open preview
                  </button>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Your rating</div>
              <div className="rate-row">
                <span className="rate-prompt">
                  {userRating > 0 ? `You rated this ${userRating} star${userRating > 1 ? 's' : ''}` : 'How was this for you?'}
                </span>
                <StarsInput value={userRating} onChange={setUserRating}/>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Comments · {seedComments.length}</div>
              <div className="comment-composer">
                <Avatar user={USERS.mp} size="sm"/>
                <div className="input" style={{ flex: 1 }}>
                  <textarea
                    placeholder="Comment, ask a question, or suggest an edit…"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                  />
                  <div className="input-actions">
                    <button className="btn btn-primary btn-sm" disabled={!commentText.trim()}>Post</button>
                  </div>
                </div>
              </div>
              <div className="comment-list">
                {seedComments.map(c => <Comment key={c.id} c={c} />)}
              </div>
            </div>
          </div>

          <aside className="detail-side">
            <div className="side-actions">
              <button className="btn btn-accent">
                <Icons.Share size={14}/> Generate share link
              </button>
              <button className="btn btn-secondary">
                <Icons.Bookmark size={14}/> Follow updates
              </button>
            </div>

            <div className="aggregate-rating">
              <span className="big">{item.rating.toFixed(1)}</span>
              <span className="out-of">/ 5.0</span>
            </div>
            <Stars value={item.rating} size="lg"/>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {item.ratings} ratings · {item.views} views · {item.shares} shares
            </div>

            <div style={{ height: 1, background: 'var(--line)', margin: '20px 0' }}/>

            <div className="side-row">
              <div className="label">Uploader</div>
              <div className="value">
                <div className="row">
                  <Avatar user={uploader} size="sm"/>
                  <div>
                    <div style={{ fontWeight: 500 }}>{uploader.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.04em' }}>@{uploader.handle}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="side-row">
              <div className="label">Added</div>
              <div className="value">{item.date}</div>
            </div>
            <div className="side-row">
              <div className="label">Updated</div>
              <div className="value">{item.created}</div>
            </div>
            <div className="side-row">
              <div className="label">Type</div>
              <div className="value">
                <div className="row" style={{ gap: 6 }}>
                  <meta.icon size={13} stroke={meta.color}/> {meta.label}
                </div>
              </div>
            </div>
            <div className="side-row">
              <div className="label">Source</div>
              <div className="value">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {item.isExternal ? `${item.source} ↗` : 'Supabase Storage'}
                </span>
              </div>
            </div>
            <div className="side-row">
              <div className="label">Tags</div>
              <div className="value">
                <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  {item.tags.map(t => <span key={t} className="chip">{t}</span>)}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const Comment = ({ c }) => {
  const author = USERS[c.author];
  return (
    <div className="comment">
      <Avatar user={author} size="sm"/>
      <div className="comment-body">
        <div className="comment-head">
          <span className="name">{author.name}</span>
          <span className="time">{c.time}</span>
        </div>
        <div className="comment-text">{c.body}</div>
        <div className="comment-actions">
          <button>REPLY</button>
          <button>LIKE</button>
        </div>
        {c.replies && c.replies.length > 0 && (
          <div className="replies">
            {c.replies.map(r => <Comment key={r.id} c={r} />)}
          </div>
        )}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   Upload modal
   ────────────────────────────────────────────────────── */
const UploadModal = ({ onClose, onUploaded }) => {
  const [type, setType] = useStateV('deck');
  const [title, setTitle] = useStateV('');
  const [desc, setDesc] = useStateV('');
  const [tags, setTags] = useStateV(['enterprise']);
  const [tagInput, setTagInput] = useStateV('');
  const [source, setSource] = useStateV('file'); // file or external
  const [externalUrl, setExternalUrl] = useStateV('');

  const typesArr = [
    { k:'deck', label:'Deck' }, { k:'video', label:'Video' }, { k:'demo', label:'Demo' },
    { k:'doc', label:'Doc' }, { k:'code', label:'Code' },
  ];

  // code = github only
  useEffectV(() => {
    if (type === 'code') setSource('external');
  }, [type]);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button className="modal-close" onClick={onClose}><Icons.Close size={16}/></button>
      <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="upload-head">
          <div className="ai-orb-sm" style={{ width: 28, height: 28 }}><Icons.Upload size={14}/></div>
          <div>
            <h2>Add to the hub</h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
              Open by default · No approval needed
            </div>
          </div>
        </div>

        <div className="upload-form">
          <div className="field">
            <label>Content type</label>
            <div className="type-grid">
              {typesArr.map(t => {
                const M = TYPE_META[t.k];
                return (
                  <button key={t.k} className={`type-card ${type === t.k ? 'active' : ''}`} onClick={() => setType(t.k)}>
                    <div className="type-icon" style={{ background: M.poster.includes('deck') ? 'var(--accent-soft)' : 'var(--bg-deep)', color: M.color }}>
                      <M.icon size={16}/>
                    </div>
                    <div className="name">{t.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Title</label>
            <input type="text" placeholder="e.g. Enterprise Security Pitch — Q3" value={title} onChange={e => setTitle(e.target.value)}/>
          </div>

          <div className="field">
            <label>Description</label>
            <textarea placeholder="One or two sentences. What's in it, who it's for." value={desc} onChange={e => setDesc(e.target.value)}/>
          </div>

          <div className="field">
            <label>{type === 'code' ? 'GitHub URL' : type === 'video' || type === 'demo' ? 'Source' : 'File'}</label>
            {type !== 'code' && type !== 'doc' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  className={`btn btn-sm ${source === 'file' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSource('file')}>Upload file</button>
                <button
                  className={`btn btn-sm ${source === 'external' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSource('external')}>
                  External link {type === 'video' && '(Loom, YouTube, Vimeo)'}
                </button>
              </div>
            )}

            {source === 'file' && type !== 'code' ? (
              <div className="dropzone">
                <div className="icon"><Icons.Upload size={26}/></div>
                <div className="primary">Drop a file here, or click to browse</div>
                <div className="secondary">{type === 'video' ? 'Up to 50MB · larger videos: paste a Loom or YouTube link →' : 'Up to 50MB · PDF, PPTX, MP4, MOV, ZIP'}</div>
              </div>
            ) : (
              <input
                type="text"
                placeholder={type === 'code' ? 'https://github.com/org/repo' : 'https://...'}
                value={externalUrl}
                onChange={e => setExternalUrl(e.target.value)}
              />
            )}
          </div>

          <div className="field">
            <label>Tags</label>
            <div className="tag-input" onClick={(e) => e.currentTarget.querySelector('input').focus()}>
              {tags.map(t => (
                <span key={t} className="tag-pill">{t}
                  <button onClick={() => setTags(tags.filter(x => x !== t))}><Icons.Close size={10}/></button>
                </span>
              ))}
              <input
                placeholder={tags.length ? '' : 'enterprise, pitch, security...'}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
                  if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1));
                }}
              />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              Freeform tags. Press Enter to add. Reuse existing tags when possible.
            </div>
          </div>
        </div>

        <div className="upload-foot">
          <div className="info">
            <Icons.Sparkle size={11} style={{ verticalAlign: 'middle' }}/> An embedding is generated on upload — your content becomes discoverable in chat immediately.
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent btn-sm" onClick={() => { onUploaded({ title, type }); onClose(); }} disabled={!title.trim()}>
            <Icons.Upload size={13}/> Add to hub
          </button>
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   Ideas view
   ────────────────────────────────────────────────────── */
const IdeasView = ({ onOpenContent }) => (
  <div className="ideas-view">
    <div className="library-header">
      <div className="library-title-row">
        <div>
          <div className="page-sub">Ideas · Shared brainstorm space</div>
          <h1 className="page-title">Drafts the team is kicking around</h1>
        </div>
      </div>
    </div>

    <div style={{ marginTop: 16, padding: '14px 16px', border: '1px dashed var(--line-strong)', borderRadius: 10, background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div className="ai-orb-sm"><Icons.Sparkle size={13}/></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 13.5 }}>Got an idea? Talk it through with the assistant.</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.04em', marginTop: 2 }}>
          BRAINSTORM MODE · DROP A FREEFORM IDEA AND IT'LL HELP YOU SHAPE IT
        </div>
      </div>
      <button className="btn btn-primary btn-sm">Start in chat <Icons.ChevronRight size={13}/></button>
    </div>

    <div className="ideas-grid">
      {IDEAS.map(idea => {
        const author = USERS[idea.createdBy];
        return (
          <div key={idea.id} className={`idea-card ${idea.published ? 'published' : ''}`}>
            <div className="stage">
              {idea.published ? <><Icons.CheckCircle size={11} stroke="var(--forest)"/> Published · in library</> : 'Draft'}
            </div>
            <h3>{idea.title}</h3>
            <p>{idea.summary}</p>
            <ul className="idea-outline">
              {idea.outline.slice(0, 4).map((o, i) => <li key={i}>{o}</li>)}
              {idea.outline.length > 4 && <li style={{ color: 'var(--muted)' }}>+ {idea.outline.length - 4} more</li>}
            </ul>
            <div className="idea-card-foot">
              <Avatar user={author} size="sm"/>
              <span>{author.name.split(' ')[0]}</span>
              <span className="dot" style={{ width: 2, height: 2, background: 'var(--muted-2)', borderRadius: '50%' }}></span>
              <span>{idea.createdAt}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {!idea.published && <button className="btn btn-ghost btn-sm" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Promote</button>}
                <button className="btn btn-secondary btn-sm" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Open</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ──────────────────────────────────────────────────────
   Share modal
   ────────────────────────────────────────────────────── */
const ShareModal = ({ item, onClose }) => {
  const [withPw, setWithPw] = useStateV(false);
  const [withExpiry, setWithExpiry] = useStateV(true);
  const [pw, setPw] = useStateV('');
  const [expiry, setExpiry] = useStateV('7d');
  const [copied, setCopied] = useStateV(false);
  const token = '4f1a-c83e-77bd-2a91';
  const url = `hub.solutions/share/${token}`;

  const copy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button className="modal-close" onClick={onClose}><Icons.Close size={16}/></button>
      <div className="modal share-modal" onClick={e => e.stopPropagation()}>
        <div className="upload-head">
          <div className="ai-orb-sm" style={{ width: 28, height: 28, background: 'var(--ink)' }}><Icons.Share size={14}/></div>
          <div>
            <h2>Share externally</h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
              {item.title.slice(0, 50)}{item.title.length > 50 ? '…' : ''}
            </div>
          </div>
        </div>

        <div className="upload-form" style={{ paddingBottom: 12 }}>
          <div className="field">
            <label>Public link</label>
            <div className="share-link-box">
              <Icons.Link size={13} stroke="var(--muted)"/>
              <span className="url">{url}</span>
              <button className="btn btn-secondary btn-sm" onClick={copy}>
                {copied ? <><Icons.Check size={12}/> Copied</> : <><Icons.Copy size={12}/> Copy</>}
              </button>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
              UUID TOKEN · NO ACCOUNT REQUIRED FOR RECIPIENT
            </div>
          </div>

          <div className="share-toggles">
            <div className="share-toggle">
              <div className={`switch ${withPw ? 'on' : ''}`} onClick={() => setWithPw(!withPw)}/>
              <div className="toggle-input">
                <div className="toggle-title">Password protect</div>
                <div className="toggle-sub">BCRYPT HASHED · NEVER STORED PLAIN</div>
                {withPw && <input placeholder="Set a password" value={pw} onChange={e => setPw(e.target.value)} type="text"/>}
              </div>
            </div>

            <div className="share-toggle">
              <div className={`switch ${withExpiry ? 'on' : ''}`} onClick={() => setWithExpiry(!withExpiry)}/>
              <div className="toggle-input">
                <div className="toggle-title">Set expiry</div>
                <div className="toggle-sub">ENFORCED SERVER-SIDE</div>
                {withExpiry && (
                  <select value={expiry} onChange={e => setExpiry(e.target.value)}>
                    <option value="24h">Expires in 24 hours</option>
                    <option value="7d">Expires in 7 days</option>
                    <option value="30d">Expires in 30 days</option>
                    <option value="never">No expiry</option>
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="upload-foot">
          <div className="info">
            <Icons.Lock size={11} style={{ verticalAlign: 'middle' }}/> Share count: {item.shares} · Last 5 visitors visible in detail view
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   Toast stack
   ────────────────────────────────────────────────────── */
const Toast = ({ toasts }) => (
  <div className="toast-stack">
    {toasts.map(t => (
      <div key={t.id} className="toast">
        {t.icon === 'ai' ? <div className="ai-orb-sm"><Icons.Sparkle size={11}/></div> : <Icons.Check size={14}/>}
        {t.msg}
      </div>
    ))}
  </div>
);

window.Sidebar = Sidebar;
window.TopBar = TopBar;
window.Library = Library;
window.DetailModal = DetailModal;
window.UploadModal = UploadModal;
window.IdeasView = IdeasView;
window.ShareModal = ShareModal;
window.Toast = Toast;
