import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase';
import Icons from './Icons';

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY;

const SYSTEM_PROMPT = `You are the Hub Assistant for SE Content Hub — an internal content repository for a Solutions Engineering team.

You have two modes:

1. **CONTENT DISCOVERY**: When asked to find content, recommend the most relevant items from the context provided. Be specific — cite titles and explain why each is relevant. Use [1], [2] style references.

2. **IDEATION / BRAINSTORM**: When asked to build or brainstorm, produce a clear structured outline with headings, bullet points, and sections.

**Guidelines:**
- Use markdown: **bold** for emphasis, ## for section headings, bullet lists for options, numbered lists for steps
- Cite retrieved sources with [1], [2] references
- If the library lacks relevant content, say so and offer to help build it`;

const STEP_DEFS = [
  { key: 'embed',    label: 'Generating semantic embedding' },
  { key: 'search',   label: 'Searching content library' },
  { key: 'found',    label: 'Evaluating matches' },
  { key: 'generate', label: 'Synthesizing response' },
];

const SUGGESTED = [
  { type: 'find',   label: 'Find',   text: 'Find decks for a healthcare CISO meeting next week' },
  { type: 'find',   label: 'Find',   text: 'What ROI materials do we have for legacy SIEM migrations?' },
  { type: 'ideate', label: 'Ideate', text: 'Help me build an in-booth presentation for AWS Re:Invent' },
  { type: 'ideate', label: 'Ideate', text: 'Draft a technical briefing outline for a platform engineering team' },
];

/* ── Helpers ─────────────────────────────────────────── */
function titleFromMessage(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 52 ? clean.slice(0, 52).replace(/\s+\S*$/, '') + '…' : clean;
}

function relativeTime(ts) {
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

async function embedText(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Embedding API ${res.status}: ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

async function runVectorSearch(embedding, matchCount = 8, filterUserId = null) {
  const params = { query_embedding: embedding, match_count: matchCount };
  if (filterUserId) params.filter_user_id = filterUserId;
  const { data, error } = await supabase.rpc('match_content', params);
  if (error) {
    console.error('[match_content] RPC error:', error);
    throw new Error(error.message);
  }
  console.log('[match_content] returned', data?.length ?? 0, 'rows');
  return data || [];
}

function dedupeByItem(results) {
  const map = new Map();
  for (const r of results) {
    const cur = map.get(r.content_id);
    if (!cur || (r.similarity ?? 0) > (cur.similarity ?? 0)) map.set(r.content_id, r);
  }
  return [...map.values()].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
}

function textFallback(query, items) {
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  if (!words.length) return [];
  return items
    .map(item => {
      const hay = [item.title, item.description, ...(item.tags || [])].join(' ').toLowerCase();
      const hits = words.filter(w => hay.includes(w)).length;
      return { item, score: hits / words.length };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(x => ({
      content_id: x.item.id, chunk_index: 0,
      chunk_text: x.item.description || '',
      similarity: Math.min(x.score * 0.5, 0.49),
      title: x.item.title, content_type: x.item.content_type,
    }));
}

/* ── Main component ──────────────────────────────────── */
export default function ChatView({ session, items, onOpenContent }) {
  const [sessions, setSessions] = useState([]);           // list for sidebar
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sources, setSources] = useState([]);
  const [input, setInput] = useState('');
  const [activeSteps, setActiveSteps] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [useDocuments, setUseDocuments] = useState(true);   // toggle document sourcing
  const [docScope, setDocScope] = useState('all');           // 'all' | 'mine'
  const bodyRef = useRef(null);
  const taRef = useRef(null);
  // Ref to always hold the latest steps state — avoids stale closure when
  // finalising the thinking trace (prevents double-render in React Strict Mode).
  const stepsRef = useRef(null);

  /* Load session list on mount */
  useEffect(() => {
    if (session?.user?.id) fetchSessions();
  }, [session?.user?.id]);

  /* Scroll to bottom on new content */
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, activeSteps]);

  /* Auto-resize textarea */
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.min(160, taRef.current.scrollHeight) + 'px';
    }
  }, [input]);

  /* Functional step updater — writes to both state and ref so we can read
     the latest value synchronously when freezing the trace into a message. */
  function patchStep(key, patch) {
    setActiveSteps(prev => {
      const next = prev?.map(s => s.key === key ? { ...s, ...patch } : s) ?? null;
      stepsRef.current = next;
      return next;
    });
  }

  /* ── Session management ── */
  async function fetchSessions() {
    try {
      const { data } = await supabase
        .from('chat_sessions')
        .select('id, title, created_at, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(40);
      setSessions(data || []);
    } catch (e) { console.warn('fetchSessions:', e.message); }
  }

  async function createNewSession() {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: session.user.id, title: 'New chat' })
        .select('id, title, created_at, updated_at')
        .single();
      if (error) throw error;
      setSessions(prev => [data, ...prev]);
      setActiveSessionId(data.id);
      setMessages([]);
      setSources([]);
    } catch (e) { console.error('createNewSession:', e.message); }
  }

  async function loadSession(sess) {
    if (sess.id === activeSessionId) return;
    setActiveSessionId(sess.id);
    setSources([]);
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('session_id', sess.id)
        .order('created_at', { ascending: true })
        .limit(100);
      setMessages((data || []).map(m => ({
        role: m.role === 'user' ? 'user' : 'ai',
        body: m.content,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: [],
        completedSteps: null,
        elapsed: null,
      })));
    } catch (e) { console.error('loadSession:', e.message); }
    finally { setLoadingHistory(false); }
  }

  async function deleteSession(sessId) {
    try {
      await supabase.from('chat_sessions').delete().eq('id', sessId);
      setSessions(prev => {
        const next = prev.filter(s => s.id !== sessId);
        if (activeSessionId === sessId) {
          if (next.length > 0) {
            loadSession(next[0]);
          } else {
            setActiveSessionId(null);
            setMessages([]);
            setSources([]);
          }
        }
        return next;
      });
    } catch (e) { console.error('deleteSession:', e.message); }
  }

  async function touchSession(sessionId) {
    const now = new Date().toISOString();
    await supabase.from('chat_sessions').update({ updated_at: now }).eq('id', sessionId);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, updated_at: now } : s)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  }

  async function updateSessionTitle(sessionId, title) {
    await supabase.from('chat_sessions').update({ title }).eq('id', sessionId);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
  }

  async function saveMessage(sessionId, role, content) {
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: role === 'user' ? 'user' : 'assistant',
      content,
    });
  }

  /* ── Send message ── */
  async function send(textOverride) {
    const text = (textOverride ?? input).trim();
    if (!text || activeSteps !== null) return;
    setInput('');

    /* Ensure we have an active session */
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const { data, error } = await supabase
          .from('chat_sessions')
          .insert({ user_id: session.user.id, title: titleFromMessage(text) })
          .select('id, title, created_at, updated_at')
          .single();
        if (error) throw error;
        sessionId = data.id;
        setActiveSessionId(data.id);
        setSessions(prev => [data, ...prev]);
      } catch (e) {
        console.error('Failed to create session:', e.message);
        return;
      }
    }

    setMessages(m => [...m, { role: 'user', body: text, time: 'now', sources: [], completedSteps: null }]);
    setSources([]);

    const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;
    if (isFirstMessage) {
      updateSessionTitle(sessionId, titleFromMessage(text));
    }

    const initialSteps = STEP_DEFS.map(s => ({ ...s, status: 'pending', detail: '' }));
    stepsRef.current = initialSteps;
    setActiveSteps(initialSteps);

    await saveMessage(sessionId, 'user', text);
    await touchSession(sessionId);

    const t0 = Date.now();
    let searchResults = [];
    let usedFallback = false;

    try {
      let deduped = [];

      if (useDocuments) {
        /* Step 1 – embed */
        patchStep('embed', { status: 'active' });
        const embedding = await embedText(text);
        patchStep('embed', { status: 'done', detail: `${embedding.length}-dim vector` });

        /* Step 2 – vector search */
        const scopeLabel = docScope === 'mine' ? 'your uploads' : `${items.length} item${items.length !== 1 ? 's' : ''}`;
        patchStep('search', { status: 'active', detail: `scanning ${scopeLabel}…` });
        const filterUserId = docScope === 'mine' ? session?.user?.id : null;
        let rpcError = null;
        try {
          searchResults = await runVectorSearch(embedding, 8, filterUserId);
        } catch (e) {
          rpcError = e.message;
        }

        const scopedItems = docScope === 'mine'
          ? items.filter(x => x.uploader?.id === session?.user?.id)
          : items;

        if (rpcError) {
          patchStep('search', { status: 'done', detail: `⚠ RPC error: ${rpcError} — using text fallback` });
          searchResults = textFallback(text, scopedItems);
          usedFallback = true;
        } else if (searchResults.length === 0) {
          patchStep('search', { status: 'done', detail: 'no embeddings in DB — using text fallback' });
          searchResults = textFallback(text, scopedItems);
          usedFallback = true;
        } else {
          patchStep('search', { status: 'done', detail: `${searchResults.length} chunk${searchResults.length !== 1 ? 's' : ''} retrieved` });
        }

        /* Step 3 – evaluate */
        deduped = dedupeByItem(searchResults);
        setSources(deduped);
        const aboveThreshold = deduped.filter(r => (r.similarity ?? 0) > 0.35);
        patchStep('found', {
          status: 'done',
          label: `Found ${deduped.length} source${deduped.length !== 1 ? 's' : ''}`,
          detail: deduped.length === 0
            ? 'no matches — answering from general knowledge'
            : usedFallback
              ? `${deduped.length} text-match result${deduped.length !== 1 ? 's' : ''} (no embeddings stored yet)`
              : aboveThreshold.length > 0
                ? `${aboveThreshold.length} strong match${aboveThreshold.length !== 1 ? 'es' : ''} · ${deduped.length - aboveThreshold.length} supplemental`
                : `${deduped.length} low-confidence result${deduped.length !== 1 ? 's' : ''}`,
        });
      } else {
        /* Documents disabled — skip embed/search/evaluate */
        patchStep('embed',    { status: 'done', detail: 'skipped (documents off)' });
        patchStep('search',   { status: 'done', detail: 'skipped' });
        patchStep('found',    { status: 'done', label: 'Documents off', detail: 'answering without library context' });
        setSources([]);
      }

      /* Step 4 – generate */
      patchStep('generate', { status: 'active' });

      const contextLines = deduped.map((r, i) => {
        const item = items.find(x => x.id === r.content_id);
        if (!item) return null;
        const excerpt = r.chunk_text?.slice(0, 320).replace(/\s+/g, ' ') || item.description || '';
        const pct = r.similarity != null ? ` (${Math.round(r.similarity * 100)}% match)` : '';
        return `[${i + 1}] "${item.title}" (${item.content_type})${pct}\nExcerpt: ${excerpt}`;
      }).filter(Boolean);

      const contextBlock = !useDocuments
        ? '\n\nDocument sourcing is disabled for this query. Answer from your own knowledge.'
        : contextLines.length > 0
          ? `\n\nRetrieved library content (reference as [1], [2], etc.):\n\n${contextLines.join('\n\n')}`
          : `\n\nLibrary has ${items.length} items. No relevant matches for this query.`;

      const history = messages.slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.body,
      }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          system: SYSTEM_PROMPT + contextBlock,
          messages: [
            ...history,
            { role: 'user', content: text },
          ],
          max_tokens: 1100,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Claude ${res.status}: ${body.slice(0, 100)}`);
      }
      const data = await res.json();
      const reply = data.content[0].text;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      patchStep('generate', { status: 'done', detail: `responded in ${elapsed}s` });
      await new Promise(r => setTimeout(r, 750));

      // Read frozen steps from ref — never from stale closure.
      const frozenSteps = stepsRef.current ? stepsRef.current.map(s => ({ ...s })) : null;
      stepsRef.current = null;
      setActiveSteps(null);
      setMessages(m => [...m, {
        role: 'ai', body: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: deduped.slice(0, 6),
        completedSteps: frozenSteps,
        elapsed,
      }]);

      await saveMessage(sessionId, 'assistant', reply);
      await touchSession(sessionId);
    } catch (err) {
      console.error('ChatView send error:', err);
      patchStep('generate', { status: 'done', detail: `failed: ${err.message}` });
      await new Promise(r => setTimeout(r, 600));
      const frozenSteps = stepsRef.current ? stepsRef.current.map(s => ({ ...s })) : null;
      stepsRef.current = null;
      setActiveSteps(null);
      setMessages(m => [...m, {
        role: 'ai',
        body: `**Something went wrong:** ${err.message}\n\nPlease try again.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: [], completedSteps: frozenSteps, elapsed: null,
      }]);
    }
  }

  const hasSources = sources.length > 0;

  return (
    <div className={`chat-view ${hasSources ? '' : 'no-sources'}`}>
      {/* ── Sessions sidebar ── */}
      <ChatHistorySidebar
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={loadSession}
        onNew={createNewSession}
        onDelete={deleteSession}
        loading={loadingHistory}
      />

      {/* ── Conversation ── */}
      <div className="chat-view-main">
        <div className="chat-view-body" ref={bodyRef}>
          <div className="chat-view-body-inner">
            {messages.length === 0 && !activeSteps && !loadingHistory && (
              <Welcome onPrompt={p => send(p)} />
            )}
            {loadingHistory && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <div className="thinking"><span /><span /><span /></div>
              </div>
            )}
            {!loadingHistory && messages.map((m, i) => (
              <Message key={i} msg={m} items={items}
                onOpenContent={onOpenContent}
                onHoverSource={setHighlightId}
                highlightId={highlightId} />
            ))}
            {activeSteps && <LiveThinkingRow steps={activeSteps} />}
          </div>
        </div>

        <div className="chat-view-input-wrap">
          <div className="chat-view-input-inner">
            <textarea
              ref={taRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={activeSessionId
                ? 'Continue the conversation…'
                : 'Find content, describe an idea, or ask anything about the hub…'}
              rows={1}
            />
            <div className="chat-view-input-controls">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="ai-orb-sm" style={{ width: 18, height: 18 }}>
                  <Icons.Sparkle size={10} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Hub Assistant · Claude 3.5 Haiku
                </span>
              </div>

              <div className="chat-doc-controls">
                {/* Document sourcing toggle */}
                <button
                  className={`chat-doc-toggle ${useDocuments ? 'on' : 'off'}`}
                  onClick={() => setUseDocuments(v => !v)}
                  title={useDocuments ? 'Documents on — click to disable' : 'Documents off — click to enable'}
                >
                  <Icons.Search size={10} />
                  {useDocuments ? 'Docs on' : 'Docs off'}
                </button>

                {/* Scope selector — only visible when documents are on */}
                {useDocuments && (
                  <div className="chat-scope-pills">
                    <button
                      className={`chat-scope-pill ${docScope === 'all' ? 'active' : ''}`}
                      onClick={() => setDocScope('all')}
                    >
                      Team
                    </button>
                    <button
                      className={`chat-scope-pill ${docScope === 'mine' ? 'active' : ''}`}
                      onClick={() => setDocScope('mine')}
                    >
                      Mine
                    </button>
                  </div>
                )}
              </div>

              <button
                className="chat-view-send"
                onClick={() => send()}
                disabled={!input.trim() || !!activeSteps}
              >
                <Icons.Send size={15} />
              </button>
            </div>
          </div>
          <div className="chat-view-hint">
            {useDocuments
              ? `Searching ${docScope === 'mine' ? 'your uploads' : `all ${items.length} item${items.length !== 1 ? 's' : ''}`} · last 20 messages as context · Shift+Enter for new line`
              : 'Document sourcing disabled — answering from model knowledge · Shift+Enter for new line'
            }
          </div>
        </div>
      </div>

      {/* ── Sources panel ── */}
      {hasSources && (
        <SourcesPanel
          sources={sources} items={items}
          onOpenContent={onOpenContent}
          highlightId={highlightId}
          onHover={setHighlightId}
        />
      )}
    </div>
  );
}

/* ── Chat history sidebar ────────────────────────────── */
function ChatHistorySidebar({ sessions, activeId, onSelect, onNew, onDelete, loading }) {
  return (
    <div className="chat-history-sidebar">
      <div className="chat-history-header">
        <span className="chat-history-title">Conversations</span>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 6px' }}
          onClick={onNew}
          title="New chat"
        >
          <Icons.Plus size={14} />
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNew}>
        <Icons.Plus size={13} />
        New chat
      </button>

      <div className="chat-session-list">
        {loading && (
          <div className="chat-history-empty">Loading…</div>
        )}
        {!loading && sessions.length === 0 && (
          <div className="chat-history-empty">
            No conversations yet.<br />Start a new chat to begin.
          </div>
        )}
        {!loading && sessions.map(sess => (
          <div
            key={sess.id}
            className={`chat-session-item ${sess.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(sess)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect(sess)}
          >
            <div className="chat-session-item-body">
              <div className="chat-session-name">
                {sess.title || 'Untitled chat'}
              </div>
              <div className="chat-session-meta">
                <span>{relativeTime(sess.updated_at || sess.created_at)}</span>
              </div>
            </div>
            <button
              className="chat-session-delete"
              title="Delete conversation"
              onClick={e => { e.stopPropagation(); onDelete(sess.id); }}
            >
              <Icons.Trash size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Welcome ─────────────────────────────────────────── */
function Welcome({ onPrompt }) {
  return (
    <div className="chat-view-welcome">
      <h1 className="chat-view-welcome-title">What are you <em>working on?</em></h1>
      <p className="chat-view-welcome-sub">
        Ask in plain English. I&apos;ll run a semantic search across all content in the hub — decks, demos, docs, code, and videos — and show you exactly what matched and why.
      </p>
      <div className="chat-view-prompts">
        {SUGGESTED.map((s, i) => (
          <button key={i} className={`chat-view-prompt-btn ${s.type}`} onClick={() => onPrompt(s.text)}>
            <span className="chat-view-prompt-label">{s.label}</span>
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Live thinking steps ─────────────────────────────── */
function LiveThinkingRow({ steps }) {
  return (
    <div className="cv-msg ai">
      <div className="cv-ai-header">
        <div className="ai-orb-sm" style={{ width: 18, height: 18 }}><Icons.Sparkle size={10} /></div>
        <span className="cv-ai-label">Hub Assistant</span>
      </div>
      <StepList steps={steps} />
    </div>
  );
}

/* ── Completed thinking trace ────────────────────────── */
function ThinkingTrace({ steps, elapsed }) {
  const [open, setOpen] = useState(false);
  const summary = elapsed ? `Research complete · ${elapsed}s` : 'Research complete';
  return (
    <div className="thinking-trace">
      <button className="thinking-trace-toggle" onClick={() => setOpen(o => !o)}>
        <div className="step-check" style={{ width: 14, height: 14 }}><StepCheckSVG /></div>
        <span>{summary}</span>
        <span className="thinking-trace-chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <Icons.ChevronDown size={11} />
        </span>
      </button>
      {open && <StepList steps={steps} compact />}
    </div>
  );
}

function StepList({ steps, compact }) {
  return (
    <div className={`thinking-steps ${compact ? 'compact' : ''}`}>
      {steps.map(step => (
        <div key={step.key}>
          <div className={`thinking-step ${step.status}`}>
            <div className="thinking-step-icon">
              {step.status === 'done'    && <div className="step-check"><StepCheckSVG /></div>}
              {step.status === 'active'  && <div className="step-spinner" />}
              {step.status === 'pending' && <div className="step-dot" />}
            </div>
            <span>{step.label || STEP_DEFS.find(d => d.key === step.key)?.label}</span>
          </div>
          {step.detail && step.status !== 'pending' && (
            <div className="thinking-step-detail">{step.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function StepCheckSVG() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
      <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Message ─────────────────────────────────────────── */
function Message({ msg, items, onOpenContent, onHoverSource, highlightId }) {
  if (msg.role === 'user') {
    return (
      <div className="cv-msg user">
        <div className="cv-bubble-user">{msg.body}</div>
        <div className="cv-meta">{msg.time}</div>
      </div>
    );
  }
  return (
    <div className="cv-msg ai">
      <div className="cv-ai-header">
        <div className="ai-orb-sm" style={{ width: 18, height: 18 }}><Icons.Sparkle size={10} /></div>
        <span className="cv-ai-label">Hub Assistant</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>
          · {msg.time}
        </span>
      </div>
      {msg.completedSteps && (
        <ThinkingTrace steps={msg.completedSteps} elapsed={msg.elapsed} />
      )}
      <div className="cv-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.body}</ReactMarkdown>
      </div>
      {msg.sources?.length > 0 && (
        <SourceLinks
          sources={msg.sources} items={items}
          onOpenContent={onOpenContent}
          onHoverSource={onHoverSource}
          highlightId={highlightId}
        />
      )}
    </div>
  );
}

/* ── Inline source links ─────────────────────────────── */
function SourceLinks({ sources, items, onOpenContent, onHoverSource, highlightId }) {
  const resolved = sources.map((s, i) => {
    const item = items.find(x => x.id === s.content_id);
    return item ? { ...s, item, idx: i + 1 } : null;
  }).filter(Boolean);
  if (!resolved.length) return null;

  return (
    <div className="cv-sources-list">
      <div className="cv-sources-list-label">
        <Icons.Search size={10} /> Sources used
      </div>
      {resolved.map(({ item, similarity, chunk_text, idx }) => {
        const score = Math.round((similarity ?? 0) * 100);
        const excerpt = chunk_text
          ? chunk_text.slice(0, 180).replace(/\s+/g, ' ').trim() + (chunk_text.length > 180 ? '…' : '')
          : item.description || '';
        return (
          <button
            key={item.id}
            className={`cv-src-link ${highlightId === item.id ? 'active' : ''}`}
            onClick={() => onOpenContent(item)}
            onMouseEnter={() => onHoverSource(item.id)}
            onMouseLeave={() => onHoverSource(null)}
          >
            <div className="cv-src-num">{idx}</div>
            <div className="cv-src-body">
              <div className="cv-src-title">{item.title}</div>
              <div className="cv-src-meta">
                <span className={`source-type-badge ${item.content_type}`}>{item.content_type}</span>
                {(item.tags || []).slice(0, 2).join(' · ')}
              </div>
              {excerpt && <div className="cv-src-excerpt">{excerpt}</div>}
            </div>
            {score > 0 && <div className="cv-src-score">{score}%</div>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Sources panel ───────────────────────────────────── */
function SourcesPanel({ sources, items, onOpenContent, highlightId, onHover }) {
  return (
    <aside className="sources-panel">
      <div className="sources-panel-header">
        <Icons.Search size={11} /> Retrieved sources
        <span className="sources-panel-count">{sources.length}</span>
      </div>
      <div className="sources-panel-body">
        {sources.map((s, i) => {
          const item = items.find(x => x.id === s.content_id);
          if (!item) return null;
          const score = Math.round((s.similarity ?? 0) * 100);
          const excerpt = s.chunk_text
            ? s.chunk_text.slice(0, 220).replace(/\s+/g, ' ').trim() + (s.chunk_text.length > 220 ? '…' : '')
            : item.description || '';
          return (
            <button
              key={`${s.content_id}-${i}`}
              className={`source-card ${highlightId === item.id ? 'highlight' : ''}`}
              onClick={() => onOpenContent(item)}
              onMouseEnter={() => onHover(item.id)}
              onMouseLeave={() => onHover(null)}
            >
              <div className="source-card-head">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`source-type-badge ${item.content_type}`}>{item.content_type}</span>
                {score > 0 && <span className="source-score">{score}%</span>}
              </div>
              <div className="source-card-title">{item.title}</div>
              <div className="source-card-uploader">
                {(item.uploader?.name || item.uploader?.email || 'Unknown').split(' ')[0]}
                {(item.tags || []).slice(0, 2).length > 0 && <> · {item.tags.slice(0, 2).join(' · ')}</>}
              </div>
              {excerpt && <div className="source-card-excerpt">{excerpt}</div>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
