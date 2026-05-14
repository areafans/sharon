import { useEffect, useRef, useState } from 'react';
import { useLDClient, useFlags } from 'launchdarkly-react-client-sdk';
import { supabase } from '../lib/supabase';
import Icons from './Icons';
import { TYPE_META } from './Poster';
import { parseAIConfig, buildLDContext } from '../lib/launchdarkly';
import { runAgentGraph } from '../lib/agentGraph';

function parseReply(text, searchResults) {
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

  // hub-assistant is no longer used for AI calls — kept only so the footer can
  // display "Claude Haiku 4.5" or whatever variation is currently served. All
  // real AI Config evaluation now happens in /api/agent via the LD server SDK.
  const ldClient = useLDClient();
  const flags = useFlags();
  const aiConfig = parseAIConfig(flags['hub-assistant']);

  // Load any existing chat history once we know which user we're rendering
  // for. The work is inlined as an async IIFE so all state writes are
  // visibly behind an `await` — the previous shape (calling an out-of-line
  // `loadHistory()` helper) tripped `react-hooks/immutability` (used before
  // declared) and `react-hooks/set-state-in-effect` (the lint rule can't
  // trace async boundaries through a helper).
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    let cancelled = false;

    (async () => {
      try {
        const { data: sessions } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (cancelled) return;
        const sess = sessions?.[0] ?? null;
        if (!sess) return; // no sessions yet — one will be created lazily on first send

        setChatSessionId(sess.id);

        const { data: history } = await supabase
          .from('chat_messages')
          .select('role, content, created_at')
          .eq('session_id', sess.id)
          .order('created_at', { ascending: true })
          .limit(50);

        if (cancelled) return;
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
    })();

    return () => { cancelled = true; };
    // Only re-run when the authed user changes; the full `session` object
    // (refreshed tokens etc.) would re-fire this effect on every Supabase
    // auth refresh and wipe in-memory chat state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // /api/agent uses the LD server-side AI SDK so every call records metrics
      // on the AI Config Monitoring tab automatically.
      const ldContext = buildLDContext(session);
      const { replyText, route, agentLabel, searchResults: agentSearchResults, savedDraft } = await runAgentGraph({
        query: text,
        history: historyMsgs,
        ldContext,
        userId: session?.user?.id,
        onRoute: (info) => setRoutingStatus({ label: info.label, hint: info.hint }),
      });

      ldClient?.track('chat-response-latency', null, Date.now() - sendStartMs);

      // The retrieval agent runs search server-side; its result comes back
      // alongside the text so we can render inline cards for the top matches.
      const searchResults = (agentSearchResults || []).map(r => ({
        content_id: r.id,
        similarity: (r.similarity || 0) / 100,
      }));

      const { body, draft, cards } = parseReply(replyText, searchResults);

      // Surface the saved draft to the parent in case the agent saved one.
      if (savedDraft && onSaveIdea) onSaveIdea(savedDraft);

      const reply = {
        role: 'ai',
        body,
        time: 'Just now',
        agentLabel,
        route,
        cards: cards.length > 0 ? cards : undefined,
        draft: draft ?? savedDraft,
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
