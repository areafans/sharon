import { useEffect, useRef, useState } from 'react';
import { useLDClient, useFlags } from 'launchdarkly-react-client-sdk';
import { supabase } from '../lib/supabase';
import Icons from './Icons';
import { TYPE_META } from './Poster';
import { parseAIConfig, aiConfigLabel } from '../lib/launchdarkly';
import { runAgentGraph, AGENT_KEYS, ROUTE_CONFIG } from '../lib/agentGraph';

const TAVILY_KEY = import.meta.env.VITE_TAVILY_API_KEY;

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;

async function embedText(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!res.ok) throw new Error('Embedding failed');
  const data = await res.json();
  return data.data[0].embedding;
}

async function searchContent(embedding, matchCount = 5) {
  try {
    const { data } = await supabase.rpc('match_content', {
      query_embedding: embedding,
      match_count: matchCount,
    });
    return data || [];
  } catch {
    return [];
  }
}

function parseReply(text, searchResults, items) {
  let body = text;
  let draft = null;
  let cards = [];

  // Extract draft artifact if present
  const draftMatch = text.match(/<draft>([\s\S]*?)<\/draft>/);
  if (draftMatch) {
    try {
      draft = JSON.parse(draftMatch[1].trim());
      body = text.replace(/<draft>[\s\S]*?<\/draft>/, '').trim();
    } catch { /* ignore parse errors */ }
  }

  // Attach inline cards for search results
  if (searchResults.length > 0) {
    const seen = new Set();
    cards = searchResults.slice(0, 3).map((r, i) => ({
      id: r.content_id,
      similarity: r.similarity,
      relevance: Math.round(r.similarity * 100),
      why: i === 0 ? 'Top match' : i === 1 ? 'Related' : 'Tangential',
    })).filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }

  return { body, draft, cards };
}

function InlineCard({ card, items, onOpen }) {
  const ldClient = useLDClient();
  const item = items.find(i => i.id === card.id);
  if (!item) return null;
  const meta = TYPE_META[item.content_type] || TYPE_META.doc;

  return (
    <button className="inline-content-card" onClick={() => {
      ldClient?.track('chat-content-opened', { contentType: item.content_type, relevance: card.relevance });
      onOpen(item);
    }}>
      <div className={`inline-card-poster ${meta.poster}`}>
        {meta.label.slice(0, 3).toUpperCase()}
      </div>
      <div className="inline-card-body">
        <div className="inline-card-title">{item.title}</div>
        <div className="inline-card-meta">
          {(item.uploader?.name || item.uploader?.email || 'Unknown').split(' ')[0]} · {(item.tags || []).slice(0, 2).join(' · ')}
        </div>
      </div>
      {card.relevance != null && (
        <div className="inline-card-relevance">
          <b>{card.relevance}%</b><br />match
        </div>
      )}
    </button>
  );
}

function IdeaDraftCard({ draft, onSave }) {
  const ldClient = useLDClient();
  return (
    <div className="idea-draft">
      <div className="idea-draft-label">
        <Icons.Bulb size={12} /> Draft artifact · AI generated
      </div>
      <div className="idea-draft-title">{draft.title}</div>
      {draft.summary && <div className="idea-draft-summary">{draft.summary}</div>}
      {draft.outline?.length > 0 && (
        <ul className="idea-draft-outline">
          {draft.outline.map((o, i) => <li key={i}>{o}</li>)}
        </ul>
      )}
      <div className="idea-draft-actions">
        <button className="btn btn-primary btn-sm" onClick={() => {
          ldClient?.track('chat-draft-saved');
          onSave(draft);
        }}>
          <Icons.Bookmark size={13} /> Save as idea
        </button>
      </div>
    </div>
  );
}

export default function ChatPanel({ collapsed, onToggle, onOpenContent, onSaveIdea, session, items }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('auto');
  const [thinking, setThinking] = useState(false);
  const [routingStatus, setRoutingStatus] = useState(null); // { label, hint } while an agent runs
  const [chatSessionId, setChatSessionId] = useState(null);
  const bodyRef = useRef(null);
  const taRef = useRef(null);

  // All agent AI Configs are read from LaunchDarkly at runtime.
  // Swapping a model or system prompt in the LD UI takes effect immediately —
  // no code deploy needed. This makes the app a live demo of LD AI Configs.
  const ldClient = useLDClient();
  const flags = useFlags();
  const aiConfig = parseAIConfig(flags['hub-assistant']); // kept for footer label

  // Tool executors — closures with access to component state/props.
  // These implement the 5 LD AI Tools registered in the sharon project.
  const toolExecutors = {
    search_content_library: async ({ query, limit = 5 }) => {
      try {
        const embedding = await embedText(query);
        const results = await searchContent(embedding, Math.min(limit, 10));
        const resolved = results.map(r => {
          const item = items.find(i => i.id === r.content_id);
          if (!item) return null;
          return {
            id: item.id, title: item.title, type: item.content_type,
            description: item.description, tags: item.tags || [],
            similarity: Math.round((r.similarity ?? 0) * 100),
          };
        }).filter(Boolean);
        return JSON.stringify(resolved);
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },

    save_idea_draft: async ({ title, summary, outline }) => {
      try {
        const draft = { isDraft: true, title, summary, outline };
        const { error } = await supabase.from('ideas').insert({
          created_by: session.user.id,
          title, artifact: draft, published: false,
        });
        if (error) throw error;
        if (onSaveIdea) onSaveIdea(draft);
        return JSON.stringify({ success: true, message: `Idea "${title}" saved to the Ideas board.` });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    },

    get_content_by_tag: async ({ tags }) => {
      const matched = items
        .filter(item => (item.tags || []).some(t => tags.includes(t)))
        .slice(0, 10)
        .map(item => ({ id: item.id, title: item.title, type: item.content_type, tags: item.tags || [] }));
      return JSON.stringify(matched);
    },

    get_content_metadata: async ({ content_id }) => {
      const item = items.find(i => i.id === content_id);
      if (!item) return JSON.stringify({ error: 'Content item not found' });
      return JSON.stringify({
        id: item.id, title: item.title, type: item.content_type,
        description: item.description, tags: item.tags || [],
        uploader: item.uploader?.name || item.uploader?.email || 'Unknown',
        created_at: item.created_at, view_count: item.view_count,
        avg_rating: item.avg_rating,
      });
    },

    track_content_engagement: async ({ content_id, interaction_type }) => {
      ldClient?.track('content-engagement', { content_id, interaction_type, source: 'chat-panel' });
      return JSON.stringify({ success: true });
    },

    web_search: async ({ query, num_results = 5 }) => {
      if (!TAVILY_KEY) {
        return JSON.stringify({
          error: 'Web search is not configured.',
          setup: 'Add VITE_TAVILY_API_KEY to .env.local — free tier at tavily.com (1,000 queries/month).',
        });
      }
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: TAVILY_KEY,
            query,
            max_results: Math.min(num_results, 10),
            include_answer: true,
            search_depth: 'advanced',
          }),
        });
        if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
        const data = await res.json();
        return JSON.stringify({
          answer: data.answer || null,
          results: (data.results || []).slice(0, num_results).map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.content?.slice(0, 400),
            published_date: r.published_date,
          })),
        });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
  };

  useEffect(() => {
    if (session) loadHistory();
  }, [session?.user?.id]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.min(120, taRef.current.scrollHeight) + 'px';
    }
  }, [input]);

  async function loadHistory() {
    try {
      const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      const sess = sessions?.[0] ?? null;
      if (!sess) return; // no sessions yet — one will be created lazily on first send

      setChatSessionId(sess.id);

      const { data: history } = await supabase
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('session_id', sess.id)
        .order('created_at', { ascending: true })
        .limit(50);

      if (history?.length > 0) {
        setMessages(history.map(m => ({
          role: m.role === 'user' ? 'user' : 'ai',
          body: m.content,
          time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        })));
      }
    } catch (err) {
      console.warn('Chat history load failed:', err.message);
    }
  }

  async function saveMessage(role, content, sessionId) {
    const sid = sessionId ?? chatSessionId;
    if (!sid) return;
    await supabase.from('chat_messages').insert({
      session_id: sid,
      role: role === 'user' ? 'user' : 'assistant',
      content,
    });
  }

  async function send(textOverride) {
    const text = (textOverride ?? input).trim();
    if (!text || thinking) return;

    /* Lazily create a session on the first message */
    let sessionId = chatSessionId;
    if (!sessionId) {
      try {
        const { data: newSess, error } = await supabase
          .from('chat_sessions')
          .insert({ user_id: session.user.id, title: text.slice(0, 52) })
          .select('id')
          .single();
        if (error) throw error;
        sessionId = newSess.id;
        setChatSessionId(newSess.id);
        ldClient?.track('chat-session-started', { model: aiConfig.model, mode });
      } catch (e) {
        console.error('Failed to create chat session:', e.message);
        return;
      }
    }

    const userMsg = { role: 'user', body: text, time: 'Just now' };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setThinking(true);

    await saveMessage('user', text, sessionId);

    const sendStartMs = Date.now();

    try {
      const historyMsgs = messages.slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.body,
      }));

      ldClient?.track('chat-message-sent', { mode, queryLength: text.length });

      // Run the agent graph — orchestrator routes, then specialist executes.
      // All agent configs (model, prompt, tools) are served live from LD AI Configs.
      const { replyText, route, agentLabel } = await runAgentGraph({
        query: text,
        history: historyMsgs,
        flags,
        toolExecutors,
        onRoute: (info) => setRoutingStatus({ label: info.label, hint: info.hint }),
      });

      ldClient?.track('chat-response-latency', null, Date.now() - sendStartMs);

      // For the retrieval agent, still run vector search to populate inline cards
      let searchResults = [];
      if (route === 'retrieval' && OPENAI_KEY) {
        try {
          const embedding = await embedText(text);
          searchResults = await searchContent(embedding);
        } catch { /* non-fatal */ }
      }

      const { body, draft, cards } = parseReply(replyText, searchResults, items);

      const reply = {
        role: 'ai',
        body,
        time: 'Just now',
        agentLabel,
        cards: cards.length > 0 ? cards : undefined,
        draft,
      };
      setMessages(m => [...m, reply]);
      await saveMessage('assistant', replyText, sessionId);
    } catch (err) {
      console.error('Chat error:', err);
      ldClient?.track('chat-error', { mode });
      const errMsg = { role: 'ai', body: 'Sorry, I hit an error. Please try again.', time: 'Just now' };
      setMessages(m => [...m, errMsg]);
      await saveMessage('assistant', errMsg.body, sessionId);
    } finally {
      setThinking(false);
      setRoutingStatus(null);
    }
  }

  if (collapsed) {
    return (
      <div className="chat-collapsed-rail">
        <button className="ai-orb" onClick={onToggle} title="Open Hub Assistant">
          <Icons.Sparkle size={18} />
        </button>
        <button title="History"><Icons.Clock size={18} /></button>
        <button title="Ideas"><Icons.Bulb size={18} /></button>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="ai-orb-sm"><Icons.Sparkle size={13} /></div>
        <div style={{ flex: 1 }}>
          <div className="chat-header-title">Hub Assistant</div>
          <div className="chat-header-sub">Discovery · Writing · Research</div>
        </div>
        <button className="btn btn-ghost btn-sm" title="New session" onClick={() => setMessages([])}>
          <Icons.Plus size={14} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onToggle} title="Collapse">
          <Icons.PanelRight size={14} />
        </button>
      </div>

      <div className="chat-mode-tabs">
        {[
          { k: 'auto', label: 'Auto' },
          { k: 'find', label: 'Find content' },
          { k: 'brainstorm', label: 'Brainstorm' },
        ].map(t => (
          <button
            key={t.k}
            className={`chat-mode-tab ${mode === t.k ? 'active' : ''}`}
            onClick={() => setMode(t.k)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 ? (
          <ChatEmpty onPrompt={p => send(p)} />
        ) : (
          <>
            {messages.map((m, i) => (
              <ChatMessage
                key={i}
                msg={m}
                items={items}
                onOpenContent={onOpenContent}
                onSaveIdea={onSaveIdea}
              />
            ))}
            {thinking && (
              <div className="msg ai">
                <div className="msg-meta">
                  <div className="ai-orb-sm" style={{ width: 16, height: 16 }}>
                    <Icons.Sparkle size={9} />
                  </div>
                  {routingStatus
                    ? <><strong>{routingStatus.label}</strong> · {routingStatus.hint}</>
                    : 'Routing query…'
                  }
                </div>
                <div className="msg-bubble">
                  <div className="thinking"><span /><span /><span /></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="chat-input-wrap">
        <div className="chat-input">
          <textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={mode === 'brainstorm'
              ? 'Describe what you want to make…'
              : 'Find content, or describe what you want to build…'}
            rows={1}
          />
          <div className="chat-input-actions">
            <span className="mode-hint">
              {mode === 'auto' ? 'Auto-detect mode' : mode === 'find' ? 'Find mode' : 'Brainstorm mode'}
            </span>
            <button className="send-btn" onClick={() => send()} disabled={!input.trim() || thinking}>
              <Icons.Send size={14} />
            </button>
          </div>
        </div>
        <div className="chat-disclaimer">Agent graph · 4 specialists · powered by LaunchDarkly AI Configs</div>
      </div>
    </div>
  );
}

function ChatEmpty({ onPrompt }) {
  return (
    <div className="chat-empty">
      <div>
        <div className="chat-empty-title">Hi. What are you working on?</div>
        <div className="chat-empty-body" style={{ marginTop: 8 }}>
          Ask in plain English. I&apos;ll search the hub for relevant decks, demos, docs and code — or help you draft something new from scratch.
        </div>
      </div>

      <div className="suggested-prompts">
        <div className="suggested-label">Suggested</div>
        <button className="suggested-prompt find" onClick={() => onPrompt('Find decks for a healthcare prospect — CISO meeting next week')}>
          <div className="suggested-prompt-icon">FND</div>
          Find decks for a healthcare prospect — CISO meeting next week
        </button>
        <button className="suggested-prompt find" onClick={() => onPrompt('What ROI materials do we have for migrations?')}>
          <div className="suggested-prompt-icon">FND</div>
          What ROI materials do we have for migrations?
        </button>
        <button className="suggested-prompt ideate" onClick={() => onPrompt('I want to build an in-booth presentation for AWS Re:Invent')}>
          <div className="suggested-prompt-icon">IDE</div>
          I want to build an in-booth presentation for AWS Re:Invent
        </button>
        <button className="suggested-prompt ideate" onClick={() => onPrompt('Help me put together a technical briefing for a platform engineering team')}>
          <div className="suggested-prompt-icon">IDE</div>
          Help me put together a technical briefing for a platform engineering team
        </button>
        <button className="suggested-prompt" onClick={() => onPrompt('Research Datadog — what are their key differentiators against LaunchDarkly for feature management?')}>
          <div className="suggested-prompt-icon">RES</div>
          Research Datadog — competitive positioning vs LaunchDarkly for feature management
        </button>
      </div>
    </div>
  );
}

function ChatMessage({ msg, items, onOpenContent, onSaveIdea }) {
  if (msg.role === 'user') {
    return (
      <div className="msg user">
        <div className="msg-bubble">{msg.body}</div>
        <div className="msg-meta">{msg.time}</div>
      </div>
    );
  }

  return (
    <div className="msg ai">
      <div className="msg-meta">
        <div className="ai-orb-sm" style={{ width: 16, height: 16 }}>
          <Icons.Sparkle size={9} />
        </div>
        {msg.agentLabel ? `${msg.agentLabel}` : 'Hub Assistant'} · {msg.time}
      </div>
      <div className="msg-bubble">
        <div className="ai-answer">
          {(msg.body || '').split('\n\n').map((p, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          ))}
        </div>
        {msg.cards?.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {msg.cards.map(c => (
              <InlineCard key={c.id} card={c} items={items} onOpen={onOpenContent} />
            ))}
          </div>
        )}
        {msg.clarify && (
          <div className="clarify-row">
            {msg.clarify.map((c, i) => (
              <button key={i} className="clarify-chip">{c}</button>
            ))}
          </div>
        )}
        {msg.draft && (
          <IdeaDraftCard draft={msg.draft} onSave={onSaveIdea} />
        )}
      </div>
    </div>
  );
}
