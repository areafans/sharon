import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icons from './Icons';
import { TYPE_META } from './Poster';

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are the Hub Assistant for SE Content Hub — an internal content repository for a Solutions Engineering team.

You operate in two modes based on the message:

1. CONTENT DISCOVERY: When someone asks to find, search, or wants to know what exists, search and recommend relevant items from the library context provided.

2. IDEATION / BRAINSTORM: When someone wants to build, create, draft, or brainstorm something new, help them develop a structured idea. Ask clarifying questions first (audience, format, goals), then produce a structured JSON artifact with this shape:
   {"isDraft": true, "title": "...", "summary": "...", "outline": ["section 1", "section 2", ...]}

Always be specific, concise, and actionable. Reference content by title when recommending. If generating a draft artifact, include the JSON inline in your response wrapped in <draft>...</draft> tags.`;

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

async function searchContent(embedding) {
  try {
    const { data } = await supabase.rpc('match_content', {
      query_embedding: embedding,
      match_count: 5,
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
  const item = items.find(i => i.id === card.id);
  if (!item) return null;
  const meta = TYPE_META[item.content_type] || TYPE_META.doc;

  return (
    <button className="inline-content-card" onClick={() => onOpen(item)}>
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
        <button className="btn btn-primary btn-sm" onClick={() => onSave(draft)}>
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
  const [chatSessionId, setChatSessionId] = useState(null);
  const bodyRef = useRef(null);
  const taRef = useRef(null);

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

    try {
      // 1. Embed query + vector search
      let searchResults = [];
      if (OPENAI_KEY) {
        try {
          const embedding = await embedText(text);
          searchResults = await searchContent(embedding);
        } catch (e) {
          console.warn('Search skipped:', e.message);
        }
      }

      // 2. Build context from search results + recent items
      const contextItems = searchResults.length > 0
        ? searchResults.map(r => {
            const item = items.find(i => i.id === r.content_id);
            if (!item) return null;
            return `- "${item.title}" [${item.content_type}] — ${item.description || 'No description'} (tags: ${(item.tags || []).join(', ')})`;
          }).filter(Boolean)
        : items.slice(0, 10).map(i =>
            `- "${i.title}" [${i.content_type}] — ${i.description || 'No description'}`
          );

      const contextBlock = contextItems.length > 0
        ? `\n\nRelevant library content:\n${contextItems.join('\n')}`
        : '\n\nLibrary is currently empty.';

      // 3. Build history (last 20 messages)
      const historyMsgs = messages.slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.body,
      }));

      // 4. Call OpenAI
      const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + contextBlock },
            ...historyMsgs,
            { role: 'user', content: text },
          ],
          max_tokens: 800,
          temperature: 0.7,
        }),
      });

      if (!chatRes.ok) throw new Error(`OpenAI API error: ${chatRes.status}`);
      const chatData = await chatRes.json();
      const replyText = chatData.choices[0].message.content;

      const { body, draft, cards } = parseReply(replyText, searchResults, items);

      const reply = { role: 'ai', body, time: 'Just now', cards: cards.length > 0 ? cards : undefined, draft };
      setMessages(m => [...m, reply]);
      await saveMessage('assistant', replyText, sessionId);
    } catch (err) {
      console.error('Chat error:', err);
      const errMsg = { role: 'ai', body: 'Sorry, I hit an error. Please try again.', time: 'Just now' };
      setMessages(m => [...m, errMsg]);
      await saveMessage('assistant', errMsg.body, sessionId);
    } finally {
      setThinking(false);
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
          <div className="chat-header-sub">Discovery · Ideation</div>
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
                  Searching · synthesizing…
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
        <div className="chat-disclaimer">GPT-4o mini · last 20 messages as context</div>
      </div>
    </div>
  );
}

function ChatEmpty({ onPrompt }) {
  return (
    <div className="chat-empty">
      <div>
        <div className="chat-empty-title">Hi. What are you <em>working on?</em></div>
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
        Hub Assistant · {msg.time}
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
