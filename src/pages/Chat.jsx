import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const TYPE_COLORS = {
  deck:  { bg: '#e5e7eb', color: '#111827' },
  video: { bg: '#d1d5db', color: '#111827' },
  demo:  { bg: '#f3f4f6', color: '#374151' },
  doc:   { bg: '#e5e7eb', color: '#374151' },
  code:  { bg: '#d1d5db', color: '#111827' },
};

function getTypeBadgeStyle(type) {
  return TYPE_COLORS[type] || { bg: '#f0f0f0', color: '#555' };
}

async function generateEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Embedding generation failed');
  }
  const data = await res.json();
  return data.data[0].embedding;
}

async function searchSimilarContent(embedding, matchCount = 5, userId = null) {
  // Fetch extra chunks so that after deduplication we still have matchCount distinct sources.
  // A single document can contribute many high-scoring chunks and crowd out other sources.
  const fetchCount = Math.min(matchCount * 4, 60);
  const { data, error } = await supabase.rpc('match_content', {
    query_embedding:  embedding,
    match_count:      fetchCount,
    filter_user_id:   userId,
  });
  if (error) throw new Error(error.message);

  // Keep only the highest-similarity chunk per content_id, then return top matchCount sources.
  const best = new Map();
  for (const row of (data || [])) {
    const prev = best.get(row.content_id);
    if (!prev || row.similarity > prev.similarity) {
      best.set(row.content_id, row);
    }
  }
  return Array.from(best.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, matchCount);
}

async function callOpenAI(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'OpenAI API call failed');
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

function ThinkingPanel({ steps }) {
  return (
    <div style={s.messageRow}>
      <div style={s.avatar}>AI</div>
      <div style={{ ...s.bubble, ...s.bubbleAssistant, padding: '12px 16px' }}>
        {steps.length === 0 ? (
          <div style={s.typing}>
            {[0, 1, 2].map(i => (
              <span
                key={i}
                style={{
                  ...s.dot,
                  animation: 'typingBounce 1.2s infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {steps.map(step => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {step.state === 'done' ? (
                  <span style={s.stepDotDone} />
                ) : (
                  <span style={{
                    ...s.stepDotActive,
                    animation: 'statusPulse 1.4s ease-in-out infinite',
                  }} />
                )}
                <span style={{
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: step.state === 'done' ? '#9ca3af' : '#111827',
                  fontStyle: step.state === 'done' ? 'normal' : 'normal',
                }}>
                  {step.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ src }) {
  const badge = getTypeBadgeStyle(src.content_type);
  const hasLink = src.file_url && src.file_url !== '#';
  return (
    <a
      href={hasLink ? src.file_url : undefined}
      target={hasLink ? '_blank' : undefined}
      rel="noopener noreferrer"
      style={{
        ...s.sourceCard,
        cursor: hasLink ? 'pointer' : 'default',
        textDecoration: 'none',
      }}
      onClick={e => !hasLink && e.preventDefault()}
    >
      <span style={{ ...s.typeBadge, background: badge.bg, color: badge.color }}>
        {src.content_type}
      </span>
      <span style={s.sourceTitle}>{src.title}</span>
      {hasLink && <span style={s.sourceArrow}>↗</span>}
    </a>
  );
}

function ChatMessage({ msg, userInitial }) {
  const isUser = msg.role === 'user';

  const dedupedSources = msg.sources
    ? [...new Map(msg.sources.map(s => [s.content_id, s])).values()]
    : [];

  return (
    <div style={{ ...s.messageRow, ...(isUser ? s.messageRowUser : {}) }}>
      <div style={{ ...s.avatar, ...(isUser ? s.avatarUser : {}) }}>
        {isUser ? userInitial : 'AI'}
      </div>
      <div style={{ ...s.bubble, ...(isUser ? s.bubbleUser : s.bubbleAssistant) }}>
        <p style={{ ...s.messageText, ...(isUser ? s.messageTextUser : {}) }}>
          {msg.content}
        </p>

        {dedupedSources.length > 0 && (
          <div style={s.sources}>
            <p style={s.sourcesLabel}>Sources</p>
            <div style={s.sourceList}>
              {dedupedSources.map(src => (
                <SourceCard key={src.content_id} src={src} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat({ session, navigate }) {
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [sourcing, setSourcing]         = useState(true);
  const [sourceCount, setSourceCount]   = useState(5);
  const [searchScope, setSearchScope]   = useState('all'); // 'all' | 'mine'
  const [error, setError]               = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  const user        = session.user;
  const userInitial = (user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, thinkingSteps]);

  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);
    setThinkingSteps([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg = { id: Date.now(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const pushStep = (text) => {
      setThinkingSteps(prev => {
        const completed = prev.map(s => ({ ...s, state: 'done' }));
        return [...completed, { text, state: 'active', id: Date.now() + Math.random() }];
      });
    };

    try {
      let sources = [];
      let systemContent =
        'You are a helpful sales enablement assistant. Answer questions clearly and concisely.';

      if (sourcing) {
        pushStep('Reading your question and converting it into a semantic vector…');
        const embedding = await generateEmbedding(text);

        pushStep(`Searching the content library for the ${sourceCount} closest matches…`);
        const userId  = searchScope === 'mine' ? user.id : null;
        const results = await searchSimilarContent(embedding, sourceCount, userId);
        sources = results;

        if (results.length > 0) {
          pushStep(`Found ${results.length} relevant source${results.length !== 1 ? 's' : ''} — extracting key passages…`);

          const contextText = results
            .map((r, i) => `[Source ${i + 1}: ${r.title}]\n${r.chunk_text}`)
            .join('\n\n---\n\n');

          systemContent =
            `You are a helpful sales enablement assistant with access to the company's content library.\n\n` +
            `Use the following context to answer the user's question. Reference specific sources when relevant. ` +
            `If the context does not contain sufficient information, say so and answer from general knowledge.\n\n` +
            `CONTEXT:\n${contextText}`;

          await new Promise(r => setTimeout(r, 280));
          pushStep(`Injecting ${results.length} source${results.length !== 1 ? 's' : ''} into the prompt context — sending to model…`);
        } else {
          pushStep('No strong matches found in the library — will answer from general knowledge…');
          await new Promise(r => setTimeout(r, 200));
          pushStep('Sending to the model…');
        }
      } else {
        pushStep('Content sourcing is off — sending directly to the model…');
      }

      const openAIMessages = [
        { role: 'system', content: systemContent },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ];

      const reply = await callOpenAI(openAIMessages);

      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', content: reply, sources },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setThinkingSteps([]);
      textareaRef.current?.focus();
    }
  }, [input, loading, sourcing, sourceCount, searchScope, messages, user.id]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <strong style={s.logo}>SE Content Hub</strong>
          <nav style={s.nav}>
            <button style={s.navLink} onClick={() => navigate('dashboard')}>Dashboard</button>
            <button style={s.navLink} onClick={() => navigate('library')}>Library</button>
            <button style={{ ...s.navLink, ...s.navLinkActive }}>Chat</button>
          </nav>
        </div>
        <div style={s.headerRight}>
          <span style={s.userBadge}>{user.user_metadata?.full_name || user.email}</span>
          <button style={s.uploadBtn} onClick={() => navigate('upload')}>+ Upload</button>
          <button style={s.signOutBtn} onClick={() => supabase.auth.signOut()}>Sign Out</button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={s.body}>
        <div style={s.container}>

          {/* ── Settings bar ── */}
          <div style={s.settingsBar}>

            {/* Left: toggle + dropdowns */}
            <div style={s.settingsLeft}>
              <label style={s.toggleLabel} onClick={() => setSourcing(v => !v)}>
                <div style={{ ...s.track, ...(sourcing ? s.trackOn : s.trackOff) }}>
                  <div style={{ ...s.thumb, ...(sourcing ? s.thumbOn : s.thumbOff) }} />
                </div>
                <div style={s.toggleText}>
                  <span style={s.toggleTitle}>Content Sourcing</span>
                  <span style={s.toggleDesc}>
                    {sourcing
                      ? 'Grounding answers in your content library'
                      : 'Answering from general knowledge only'}
                  </span>
                </div>
              </label>

              {/* Divider */}
              <div style={{ ...s.settingsDivider, opacity: sourcing ? 1 : 0.35 }} />

              {/* Source count */}
              <div style={{ ...s.selectGroup, opacity: sourcing ? 1 : 0.35, pointerEvents: sourcing ? 'auto' : 'none' }}>
                <span style={s.selectLabel}>Sources</span>
                <select
                  style={s.select}
                  value={sourceCount}
                  onChange={e => setSourceCount(Number(e.target.value))}
                  disabled={!sourcing}
                >
                  <option value={2}>2</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </div>

              {/* Search scope */}
              <div style={{ ...s.selectGroup, opacity: sourcing ? 1 : 0.35, pointerEvents: sourcing ? 'auto' : 'none' }}>
                <select
                  style={s.select}
                  value={searchScope}
                  onChange={e => setSearchScope(e.target.value)}
                  disabled={!sourcing}
                >
                  <option value="all">All content</option>
                  <option value="mine">My content only</option>
                </select>
              </div>
            </div>

            {/* Right: clear */}
            {messages.length > 0 && (
              <button
                style={s.clearBtn}
                onClick={() => { setMessages([]); setError(null); }}
              >
                Clear chat
              </button>
            )}
          </div>

          {/* ── Messages ── */}
          <div style={s.messagesArea}>
            {messages.length === 0 && !loading && (
              <div style={s.emptyState}>
              <h2 style={s.emptyTitle}>How can I help?</h2>
                <p style={s.emptyDesc}>
                  Ask anything about your sales content.
                  {sourcing
                    ? " I'll search your library to provide context-grounded answers with source links."
                    : ' Enable Content Sourcing to ground answers in your library.'}
                </p>
              </div>
            )}

            {messages.map(msg => (
              <ChatMessage key={msg.id} msg={msg} userInitial={userInitial} />
            ))}

            {loading && <ThinkingPanel steps={thinkingSteps} />}

            {error && (
              <div style={s.errorBar}>
                <span>{error}</span>
                <button style={s.errorDismiss} onClick={() => setError(null)}>Dismiss</button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input ── */}
          <div style={s.inputArea}>
            <div style={s.inputRow}>
              <textarea
                ref={textareaRef}
                style={s.textarea}
                value={input}
                onChange={e => { setInput(e.target.value); autoResizeTextarea(); }}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your content library…"
                rows={1}
                disabled={loading}
              />
              <button
                style={{ ...s.sendBtn, ...(!canSend ? s.sendBtnOff : {}) }}
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 13V3M8 3L3 8M8 3l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p style={s.hint}>Enter to send · Shift+Enter for new line</p>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const s = {
  /* Layout */
  page: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f3f4f6',
    overflow: 'hidden',
    textAlign: 'left',
    color: '#111827',
    colorScheme: 'light',
  },

  /* Header */
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 24px',
    height: 52,
    borderBottom: '1px solid #d1d5db',
    background: '#ffffff',
    flexShrink: 0,
  },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 20 },
  logo:        { fontSize: 15, color: '#111827', letterSpacing: '-0.3px' },
  nav:         { display: 'flex', gap: 2 },
  navLink: {
    fontSize: 13, padding: '5px 10px', background: 'none', border: 'none',
    cursor: 'pointer', color: '#6b7280', borderRadius: 6, fontFamily: 'inherit',
  },
  navLinkActive: { background: '#e5e7eb', color: '#111827', fontWeight: 600 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userBadge:   { fontSize: 13, color: '#6b7280' },
  uploadBtn: {
    padding: '6px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
    background: '#111827', color: '#ffffff', borderRadius: 6, fontFamily: 'inherit',
  },
  signOutBtn: {
    padding: '6px 12px', fontSize: 12, cursor: 'pointer',
    border: 'none', background: '#374151', borderRadius: 6,
    fontFamily: 'inherit', color: '#ffffff',
  },

  /* Body scroll container */
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    maxWidth: 860,
    width: '100%',
    margin: '0 auto',
    padding: '0 24px',
    boxSizing: 'border-box',
  },

  /* Settings bar */
  settingsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 0 10px',
    flexShrink: 0,
    gap: 12,
  },
  settingsLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  settingsDivider: {
    width: 1,
    height: 28,
    background: '#d1d5db',
    flexShrink: 0,
  },
  selectGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'opacity 0.2s',
  },
  selectLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  select: {
    fontSize: 12,
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#ffffff',
    color: '#111827',
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'auto',
    colorScheme: 'light',
  },
  toggleLabel: {
    display: 'flex', alignItems: 'center', gap: 10,
    cursor: 'pointer', userSelect: 'none',
  },
  track: {
    width: 42, height: 22, borderRadius: 11, position: 'relative',
    cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
  },
  trackOn:  { background: '#111827' },
  trackOff: { background: '#d1d5db' },
  thumb: {
    position: 'absolute', top: 3, width: 16, height: 16,
    borderRadius: '50%', background: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
  },
  thumbOn:  { left: 23 },
  thumbOff: { left: 3 },
  toggleText: { display: 'flex', flexDirection: 'column', gap: 1 },
  toggleTitle: { fontSize: 13, fontWeight: 600, color: '#111827' },
  toggleDesc:  { fontSize: 11, color: '#6b7280' },
  clearBtn: {
    fontSize: 12, padding: '5px 12px', border: '1px solid #d1d5db',
    background: '#ffffff', borderRadius: 6, cursor: 'pointer',
    color: '#374151', fontFamily: 'inherit',
  },

  /* Messages */
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    padding: '8px 0 4px',
  },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '80px 24px', textAlign: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: 600, color: '#111827', margin: '0 0 8px' },
  emptyDesc:  { fontSize: 14, color: '#6b7280', maxWidth: 400, lineHeight: 1.65, margin: 0 },

  /* Message rows */
  messageRow: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  messageRowUser: { flexDirection: 'row-reverse' },

  avatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: '#e5e7eb', color: '#374151',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, flexShrink: 0, letterSpacing: 0,
  },
  avatarUser: { background: '#111827', color: '#ffffff' },

  bubble: {
    maxWidth: 'calc(100% - 52px)',
    borderRadius: 16,
    padding: '10px 14px',
  },
  bubbleUser: {
    background: '#111827',
    color: '#ffffff',
    borderTopRightRadius: 4,
  },
  bubbleAssistant: {
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderTopLeftRadius: 4,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  messageText: {
    margin: 0, fontSize: 14, lineHeight: 1.65,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#111827',
  },
  messageTextUser: { color: '#ffffff' },

  /* Sources */
  sources: {
    marginTop: 10, paddingTop: 10,
    borderTop: '1px solid #e5e7eb',
  },
  sourcesLabel: {
    fontSize: 10, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.6px',
    margin: '0 0 6px',
  },
  sourceList: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  sourceCard: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 9px', background: '#f3f4f6',
    border: '1px solid #d1d5db', borderRadius: 8,
    color: 'inherit',
  },
  typeBadge: {
    fontSize: 9, fontWeight: 700, padding: '1px 5px',
    borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  sourceTitle: { fontSize: 12, color: '#374151', fontWeight: 500 },
  sourceArrow: { fontSize: 10, color: '#6b7280' },

  /* Typing indicator */
  typing: { display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' },
  dot: {
    display: 'inline-block', width: 7, height: 7,
    borderRadius: '50%', background: '#9ca3af',
  },

  /* Thinking step indicators */
  stepDotDone: {
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: '#d1d5db', flexShrink: 0,
  },
  stepDotActive: {
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: '#374151', flexShrink: 0,
  },

  /* Error */
  errorBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', background: '#f3f4f6',
    border: '1px solid #d1d5db', borderRadius: 10,
    fontSize: 13, color: '#111827',
  },
  errorDismiss: {
    background: 'none', border: '1px solid #d1d5db', cursor: 'pointer',
    color: '#374151', fontSize: 12, padding: '2px 8px', borderRadius: 4,
    fontFamily: 'inherit',
  },

  /* Input area */
  inputArea: {
    flexShrink: 0,
    borderTop: '1px solid #d1d5db',
    paddingTop: 14,
    paddingBottom: 20,
    background: '#f3f4f6',
  },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: {
    flex: 1, padding: '11px 14px', fontSize: 14,
    border: '1.5px solid #d1d5db', borderRadius: 12,
    fontFamily: 'inherit', resize: 'none', outline: 'none',
    background: '#ffffff', color: '#111827', lineHeight: 1.55, overflowY: 'auto',
    boxSizing: 'border-box', colorScheme: 'light',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 10, border: 'none',
    background: '#111827', color: '#ffffff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'background 0.15s',
  },
  sendBtnOff: { background: '#d1d5db', cursor: 'not-allowed' },
  hint: { margin: '6px 0 0', fontSize: 11, color: '#6b7280', textAlign: 'center' },
};
