/* global React, Icons, Avatar, USERS, CONTENT, contentById, Poster, TYPE_META */
const { useState: useStateChat, useEffect: useEffectChat, useRef: useRefChat } = React;

/* ──────────────────────────────────────────────────────
   Inline content card (used in chat responses)
   ────────────────────────────────────────────────────── */
const InlineContentCard = ({ id, relevance, why, onOpen }) => {
  const item = contentById(id);
  if (!item) return null;
  const meta = TYPE_META[item.type];
  return (
    <button className="inline-content-card" onClick={() => onOpen(item)}>
      <div className={`inline-card-poster ${meta.poster}`} style={{ color: meta.color }}>
        {meta.label.slice(0,3).toUpperCase()}
      </div>
      <div className="inline-card-body">
        <div className="inline-card-title">{item.title}</div>
        <div className="inline-card-meta">
          {USERS[item.uploader].name.split(' ')[0]} · {item.tags.slice(0,2).join(' · ')}
        </div>
      </div>
      {relevance != null && (
        <div className="inline-card-relevance">
          <b>{relevance}%</b><br/>{why}
        </div>
      )}
    </button>
  );
};

/* ──────────────────────────────────────────────────────
   Idea draft (shown in chat after ideation)
   ────────────────────────────────────────────────────── */
const IdeaDraftCard = ({ draft, onSave, onPublish }) => (
  <div className="idea-draft">
    <div className="idea-draft-label">
      <Icons.Bulb size={12} /> Draft artifact · Generated
    </div>
    <div className="idea-draft-title">{draft.title}</div>
    <div className="idea-draft-summary">{draft.summary}</div>
    <ul className="idea-draft-outline">
      {draft.outline.map((o, i) => <li key={i}>{o}</li>)}
    </ul>
    <div className="idea-draft-actions">
      <button className="btn btn-primary btn-sm" onClick={onSave}>
        <Icons.Bookmark size={13}/> Save as idea
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onPublish}>
        <Icons.Upload size={13}/> Promote to content
      </button>
    </div>
  </div>
);

/* ──────────────────────────────────────────────────────
   Chat panel
   ────────────────────────────────────────────────────── */
const ChatPanel = ({ collapsed, onToggle, onOpenContent, onSaveIdea, initialMessages = [] }) => {
  const [messages, setMessages] = useStateChat(initialMessages);
  const [input, setInput] = useStateChat('');
  const [mode, setMode] = useStateChat('auto'); // auto / find / brainstorm
  const [thinking, setThinking] = useStateChat(false);
  const bodyRef = useRefChat(null);
  const taRef = useRefChat(null);

  useEffectChat(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, thinking]);

  useEffectChat(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.min(120, taRef.current.scrollHeight) + 'px';
    }
  }, [input]);

  if (collapsed) {
    return (
      <div className="chat-collapsed-rail">
        <button className="ai-orb" onClick={onToggle} title="Open Hub Assistant">
          <Icons.Sparkle size={18}/>
        </button>
        <button title="History"><Icons.Clock size={18}/></button>
        <button title="Ideas"><Icons.Bulb size={18}/></button>
      </div>
    );
  }

  const send = (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text) return;
    const userMsg = { role: 'user', body: text, time: 'Just now' };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      const reply = synthesizeReply(text, mode);
      setMessages(m => [...m, reply]);
    }, 1100);
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="ai-orb-sm"><Icons.Sparkle size={13}/></div>
        <div style={{ flex: 1 }}>
          <div className="chat-header-title">Hub Assistant</div>
          <div className="chat-header-sub">Discovery · Ideation</div>
        </div>
        <button className="btn btn-ghost btn-sm" title="New session">
          <Icons.Plus size={14}/>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onToggle} title="Collapse">
          <Icons.PanelRight size={14}/>
        </button>
      </div>

      <div className="chat-mode-tabs">
        {[
          {k:'auto', label:'Auto'},
          {k:'find', label:'Find content'},
          {k:'brainstorm', label:'Brainstorm'},
        ].map(t => (
          <button key={t.k} className={`chat-mode-tab ${mode === t.k ? 'active' : ''}`} onClick={() => setMode(t.k)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 ? (
          <ChatEmpty onPrompt={(p) => send(p)} />
        ) : (
          <>
            {messages.map((m, i) => (
              <ChatMessage key={i} msg={m} onOpenContent={onOpenContent} onSaveIdea={onSaveIdea} />
            ))}
            {thinking && (
              <div className="msg ai">
                <div className="msg-meta"><Icons.Sparkle size={11}/> Searching · embedding query · synthesizing</div>
                <div className="msg-bubble"><div className="thinking"><span/><span/><span/></div></div>
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
            onKeyDown={onKey}
            placeholder={mode === 'brainstorm' ? "Describe what you want to make..." : "Find content, or describe what you want to build..."}
            rows={1}
          />
          <div className="chat-input-actions">
            <span className="mode-hint">{mode === 'auto' ? 'Auto-detect mode' : mode === 'find' ? 'Find mode' : 'Brainstorm mode'}</span>
            <button className="send-btn" onClick={() => send()} disabled={!input.trim()}>
              <Icons.Send size={14}/>
            </button>
          </div>
        </div>
        <div className="chat-disclaimer">Claude · last 20 messages as context</div>
      </div>
    </div>
  );
};

const ChatEmpty = ({ onPrompt }) => (
  <div className="chat-empty">
    <div>
      <div className="chat-empty-title">Hi. What are you <em>working on?</em></div>
      <div className="chat-empty-body" style={{ marginTop: 8 }}>
        Ask in plain English. I'll search the hub for relevant decks, demos, docs and code — or help you draft something new from scratch.
      </div>
    </div>

    <div className="suggested-prompts">
      <div className="suggested-label">Suggested</div>
      <button className="suggested-prompt find" onClick={() => onPrompt("Find decks for a healthcare prospect — CISO meeting next week")}>
        <div className="suggested-prompt-icon">FND</div>
        Find decks for a healthcare prospect — CISO meeting next week
      </button>
      <button className="suggested-prompt find" onClick={() => onPrompt("What ROI materials do we have for migrations from legacy SIEM?")}>
        <div className="suggested-prompt-icon">FND</div>
        What ROI materials do we have for migrations from legacy SIEM?
      </button>
      <button className="suggested-prompt ideate" onClick={() => onPrompt("I want to build an in-booth presentation for AWS Re:Invent")}>
        <div className="suggested-prompt-icon">IDE</div>
        I want to build an in-booth presentation for AWS Re:Invent
      </button>
      <button className="suggested-prompt ideate" onClick={() => onPrompt("Help me put together a technical briefing for a platform engineering team")}>
        <div className="suggested-prompt-icon">IDE</div>
        Help me put together a technical briefing for a platform engineering team
      </button>
    </div>
  </div>
);

const ChatMessage = ({ msg, onOpenContent, onSaveIdea }) => {
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
        <div className="ai-orb-sm" style={{ width: 16, height: 16 }}><Icons.Sparkle size={9}/></div>
        Hub Assistant · {msg.time}
      </div>
      <div className="msg-bubble">
        <div className="ai-answer">
          {msg.body && msg.body.split('\n\n').map((p, i) => <p key={i} dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />)}
        </div>
        {msg.cards && msg.cards.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {msg.cards.map(c => (
              <InlineContentCard key={c.id} {...c} onOpen={onOpenContent}/>
            ))}
          </div>
        )}
        {msg.clarify && (
          <div className="clarify-row">
            {msg.clarify.map((c, i) => <button key={i} className="clarify-chip">{c}</button>)}
          </div>
        )}
        {msg.draft && <IdeaDraftCard draft={msg.draft} onSave={() => onSaveIdea(msg.draft)} onPublish={() => onSaveIdea(msg.draft)} />}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   Canned reply synthesis — keyword-based for prototype
   ────────────────────────────────────────────────────── */
function synthesizeReply(query, mode) {
  const q = query.toLowerCase();
  const isIdeation = mode === 'brainstorm'
    || /\b(build|make|create|put together|i want|help me put|brainstorm|design|draft|new)\b/.test(q)
    && !/find|show|what.*we have|do we have/.test(q);

  if (isIdeation) {
    if (q.includes('re:invent') || q.includes('reinvent') || q.includes('booth')) {
      return {
        role: 'ai',
        time: 'Just now',
        body: "Nice — booth content is a different beast from a regular pitch deck. Walk-up audience, short attention windows, and lots of competing noise. Two clarifying questions before I sketch this out, then I'll draft an outline.",
        clarify: ['8-minute walk-up', 'Self-serve kiosk', 'Live presenter', 'Hybrid'],
      };
    }
    if (q.includes('platform engineering') || q.includes('technical brief') || q.includes('engineer')) {
      return {
        role: 'ai',
        time: 'Just now',
        body: "Got it — engineer-to-engineer is usually the easiest audience to lose with marketing language. Before I draft, a couple things to lock in:",
        clarify: ['IC engineers', 'Eng leadership', '30 min', '60 min'],
      };
    }
    // generic ideation draft
    return {
      role: 'ai',
      time: 'Just now',
      body: "Here's a first-cut outline based on what you described. Refine it in chat, or save it as a draft idea — published drafts are visible to the whole SE team.",
      draft: {
        title: query.length > 50 ? query.slice(0, 60) + '...' : query.replace(/^(i want to |help me )/i, ''),
        summary: "A working outline. Each section can be expanded into 2–4 slides with talking points, or used as the skeleton for a longer-form doc.",
        outline: [
          'Frame the problem in customer language',
          'Show the specific outcome you\'re proposing',
          'Walk through the architecture / approach',
          'De-risk: what could go wrong, and how we\'ve handled it before',
          'Concrete next step (eval, pilot, or proof of value)',
        ],
      },
    };
  }

  // search mode — fuzzy match against tags + titles
  const terms = q.split(/\s+/).filter(t => t.length > 2);
  const scored = CONTENT.map(c => {
    const hay = (c.title + ' ' + c.desc + ' ' + c.tags.join(' ')).toLowerCase();
    let score = 0;
    terms.forEach(t => { if (hay.includes(t)) score += 1; });
    if (q.includes('healthcare') && (hay.includes('hipaa') || hay.includes('healthcare') || hay.includes('compliance'))) score += 2;
    if (q.includes('siem') && hay.includes('siem')) score += 3;
    if (q.includes('migration') && hay.includes('migration')) score += 2;
    if (q.includes('roi') && (hay.includes('roi') || hay.includes('cfo'))) score += 3;
    if (q.includes('finserv') || q.includes('financial')) { if (hay.includes('finserv') || hay.includes('financial')) score += 2; }
    if (q.includes('pitch') && hay.includes('pitch')) score += 1;
    if (q.includes('deck') && c.type === 'deck') score += 1;
    if (q.includes('demo') && c.type === 'demo') score += 1;
    if (q.includes('video') && c.type === 'video') score += 1;
    return { c, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

  if (scored.length === 0) {
    return {
      role: 'ai',
      time: 'Just now',
      body: "I didn't find a strong match in the hub for that one. A few angles to try:\n\nRephrasing with the buyer persona or industry (e.g. \"healthcare CISO\", \"finserv risk team\")\n\nOr — if this is something we **should** have but don't, I can help you draft it from scratch. Switch to **Brainstorm** mode and describe what you want to make.",
    };
  }

  const top = scored[0].c;
  const others = scored.slice(1).map(s => s.c);
  let body;
  if (q.includes('healthcare')) {
    body = "We don't have a dedicated healthcare pack yet, but here's what overlaps strongest — security posture and compliance materials. Maya's enterprise security deck is the closest thing we have for a CISO conversation.";
  } else if (q.includes('siem') || q.includes('migration')) {
    body = "Two strong matches and one supporting piece. **Sasha's ROI worksheet** is the highest-signal artifact — it lets you put the prospect's actual log volume into the model live on the call.";
  } else if (q.includes('finserv') || q.includes('financial')) {
    body = "**Jordan's discovery questions** are the right place to start — they're already organized by persona (CISO, Head of Risk, Data Platform). The competitive-objection doc also tends to come up in finserv evals.";
  } else {
    body = `Found ${scored.length} relevant item${scored.length === 1 ? '' : 's'}. **${top.title}** by ${USERS[top.uploader].name} is the strongest match — recently updated and well-rated.`;
  }
  return {
    role: 'ai',
    time: 'Just now',
    body,
    cards: scored.map((s, i) => ({
      id: s.c.id,
      relevance: Math.min(98, 60 + s.score * 8 + (i === 0 ? 8 : 0)),
      why: i === 0 ? 'Top match' : i === 1 ? 'Related' : 'Tangential',
    })),
  };
}

window.ChatPanel = ChatPanel;
window.InlineContentCard = InlineContentCard;
