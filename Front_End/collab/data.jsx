/* global React */

/* ──────────────────────────────────────────────────────
   Icons — 1.5px stroke, 18×18 default
   ────────────────────────────────────────────────────── */

const Icon = ({ d, size = 18, fill = 'none', stroke = 'currentColor', strokeWidth = 1.5, children, viewBox = '0 0 24 24', ...rest }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  Library: (p) => <Icon {...p}><path d="M3 5h18M3 12h18M3 19h18"/></Icon>,
  Grid: (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>,
  List: (p) => <Icon {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></Icon>,
  Sparkle: (p) => <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></Icon>,
  Bulb: (p) => <Icon {...p}><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.7.5 1.1 1.3 1.1 2.1h4.8c0-.8.4-1.6 1.1-2.1A6 6 0 0012 3z"/></Icon>,
  Activity: (p) => <Icon {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Icon>,
  Upload: (p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></Icon>,
  Search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>,
  Send: (p) => <Icon {...p}><path d="M5 12l14-7-3 14-4-6-7-1z"/></Icon>,
  Close: (p) => <Icon {...p}><path d="M18 6L6 18M6 6l12 12"/></Icon>,
  Plus: (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  Share: (p) => <Icon {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></Icon>,
  ChevronDown: (p) => <Icon {...p}><path d="M6 9l6 6 6-6"/></Icon>,
  ChevronRight: (p) => <Icon {...p}><path d="M9 18l6-6-6-6"/></Icon>,
  ChevronLeft: (p) => <Icon {...p}><path d="M15 18l-9-6 9-6"/></Icon>,
  Eye: (p) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></Icon>,
  Comment: (p) => <Icon {...p}><path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z"/></Icon>,
  Bookmark: (p) => <Icon {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></Icon>,
  Link: (p) => <Icon {...p}><path d="M10 13a5 5 0 007.5.5L21 10a5 5 0 00-7-7l-1.5 1.5M14 11a5 5 0 00-7.5-.5L3 14a5 5 0 007 7l1.5-1.5"/></Icon>,
  Copy: (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Icon>,
  Download: (p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></Icon>,
  PanelRight: (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></Icon>,
  Github: (p) => <Icon {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9c0-1 .1-1.5-.5-2C18.7 14.7 21 13.4 21 9.7A4 4 0 0019.9 7c.4-1 .4-2 0-3 0 0-1.2-.5-3.9 1.5a13 13 0 00-7 0C6.3 3.5 5.1 4 5.1 4c-.6 1.4-.5 2.6.1 3.7C4.3 8.4 4 9.7 4 11c0 4 2 4.7 4.5 5.4-.4.4-.7 1-.8 1.6V22"/></Icon>,
  File: (p) => <Icon {...p}><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7"/></Icon>,
  Star: ({size=14, filled=true, ...p}) => <Icon size={size} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.4} {...p}><path d="M12 2l3 7 7 .8-5.2 4.7 1.5 7L12 17.8 5.7 21.5l1.5-7L2 9.8 9 9z"/></Icon>,
  Deck: (p) => <Icon {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 9h20M7 5v14"/></Icon>,
  Video: (p) => <Icon {...p}><path d="M23 7l-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/></Icon>,
  Demo: (p) => <Icon {...p}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></Icon>,
  Doc: (p) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></Icon>,
  Code: (p) => <Icon {...p}><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></Icon>,
  Filter: (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></Icon>,
  Settings: (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></Icon>,
  Lock: (p) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></Icon>,
  Clock: (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Icon>,
  Check: (p) => <Icon {...p}><path d="M20 6L9 17l-5-5"/></Icon>,
  CheckCircle: (p) => <Icon {...p}><path d="M22 11.1V12a10 10 0 11-5.9-9.1"/><path d="M22 4L12 14l-3-3"/></Icon>,
  ExternalLink: (p) => <Icon {...p}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></Icon>,
  Sun: (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Icon>,
  Moon: (p) => <Icon {...p}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></Icon>,
};

/* ──────────────────────────────────────────────────────
   Type metadata
   ────────────────────────────────────────────────────── */
const TYPE_META = {
  deck:  { label: 'Deck',  icon: Icons.Deck,  color: 'var(--t-deck)',  poster: 'poster-deck' },
  video: { label: 'Video', icon: Icons.Video, color: 'var(--t-video)', poster: 'poster-video' },
  demo:  { label: 'Demo',  icon: Icons.Demo,  color: 'var(--t-demo)',  poster: 'poster-demo' },
  doc:   { label: 'Doc',   icon: Icons.Doc,   color: 'var(--t-doc)',   poster: 'poster-doc' },
  code:  { label: 'Code',  icon: Icons.Code,  color: 'var(--t-code)',  poster: 'poster-code' },
};

/* ──────────────────────────────────────────────────────
   Users
   ────────────────────────────────────────────────────── */
const USERS = {
  mp: { id: 'mp', name: 'Maya Park',     handle: 'maya-park',  role: 'Sr. Solutions Eng', color: '#6B4FBB', initials: 'MP' },
  jt: { id: 'jt', name: 'Jordan Tate',   handle: 'jtate',      role: 'Solutions Eng',     color: '#1F4E3D', initials: 'JT' },
  rn: { id: 'rn', name: 'Reza Nazari',   handle: 'reza-n',     role: 'Lead SE',           color: '#C2410C', initials: 'RN' },
  ko: { id: 'ko', name: 'Kai Okonkwo',   handle: 'kaio',       role: 'Solutions Eng',     color: '#2F6CA8', initials: 'KO' },
  sl: { id: 'sl', name: 'Sasha Liang',   handle: 'sliang',     role: 'Solutions Eng',     color: '#B83A52', initials: 'SL' },
  dh: { id: 'dh', name: 'Diego Herrera', handle: 'dherrera',   role: 'Sr. Solutions Eng', color: '#5C4A1F', initials: 'DH' },
  me: { id: 'me', name: 'You',           handle: 'you',        role: 'Solutions Eng',     color: '#1A1A18', initials: 'YO' },
};

const Avatar = ({ user, size = 'sm' }) => (
  <div className={`avatar ${size}`} style={{ background: user.color }}>{user.initials}</div>
);

/* ──────────────────────────────────────────────────────
   Content library — mock data
   ────────────────────────────────────────────────────── */
const CONTENT = [
  {
    id: 'c1', type: 'deck',
    title: 'Enterprise Security Pitch — Q3',
    desc: 'Polished pitch deck for the enterprise security segment. Covers threat model, compliance posture (SOC2, ISO 27001), and our differentiation vs. CrowdStrike and Wiz.',
    tags: ['enterprise', 'security', 'pitch', 'compliance'],
    uploader: 'mp', rating: 4.8, ratings: 23, views: 412, shares: 14, slides: 38,
    created: '2 days ago', date: 'Mar 19, 2026',
  },
  {
    id: 'c2', type: 'video',
    title: 'Live Demo — Real-time Threat Detection',
    desc: '17-minute screencast walking through our real-time detection pipeline with a synthetic attack scenario. Perfect for technical buyers.',
    tags: ['demo', 'security', 'technical-deep-dive'],
    uploader: 'rn', rating: 4.9, ratings: 31, views: 891, shares: 28, runtime: '17:24',
    isExternal: true, source: 'Loom',
    created: '6 days ago', date: 'Mar 15, 2026',
  },
  {
    id: 'c3', type: 'demo',
    title: 'Multi-tenant SaaS Reference Architecture',
    desc: 'Working demo environment showing our pod-per-tenant architecture. Includes seed data for 4 hypothetical customers. Self-serve via /demo/saas-ref.',
    tags: ['demo', 'architecture', 'enterprise', 'multi-tenant'],
    uploader: 'jt', rating: 4.7, ratings: 18, views: 256, shares: 9,
    created: '1 week ago', date: 'Mar 13, 2026',
  },
  {
    id: 'c4', type: 'doc',
    title: 'CFO ROI Worksheet — Migration from Legacy SIEM',
    desc: 'Numerical worksheet for sizing the financial case when migrating from Splunk, QRadar, or LogRhythm. Includes editable assumptions for log volume and retention.',
    tags: ['roi', 'cfo', 'finance', 'migration', 'siem'],
    uploader: 'sl', rating: 4.6, ratings: 12, views: 178, shares: 22,
    created: '2 weeks ago', date: 'Mar 6, 2026',
  },
  {
    id: 'c5', type: 'code',
    title: 'Terraform Module — Customer Onboarding',
    desc: 'Production-ready Terraform module for one-shot customer onboarding (IAM, KMS, log routing, monitoring hooks). Versioned via GitHub releases.',
    tags: ['terraform', 'infrastructure', 'onboarding', 'integrations'],
    uploader: 'ko', rating: 4.5, ratings: 9, views: 134, shares: 6,
    isExternal: true, source: 'GitHub',
    created: '3 weeks ago', date: 'Feb 28, 2026',
  },
  {
    id: 'c6', type: 'deck',
    title: 'AWS Re:Invent 2026 — Booth Presentation',
    desc: 'In-booth presentation deck designed for 8-minute walk-up engagement. Heavy on visuals, light on text. Two themes included (dark, light).',
    tags: ['conference', 'aws', 'reinvent', 'booth', 'pitch'],
    uploader: 'dh', rating: 4.4, ratings: 7, views: 98, shares: 5, slides: 22,
    created: '3 weeks ago', date: 'Feb 26, 2026',
  },
  {
    id: 'c7', type: 'video',
    title: 'Snowflake → Databricks Migration Walkthrough',
    desc: 'Customer story replay — how Acme migrated 14TB of warehouse data with our connector. Edited from a live customer success call.',
    tags: ['migration', 'data', 'customer-story', 'snowflake', 'databricks'],
    uploader: 'mp', rating: 4.8, ratings: 14, views: 322, shares: 17, runtime: '23:18',
    isExternal: true, source: 'Youtube',
    created: '1 month ago', date: 'Feb 12, 2026',
  },
  {
    id: 'c8', type: 'demo',
    title: 'FedRAMP-ready Demo Environment',
    desc: 'Air-gapped reference deployment for public sector evaluation. Pre-configured GovCloud topology, FIPS 140-2 settings, audit log retention.',
    tags: ['fedramp', 'public-sector', 'compliance', 'gov-cloud'],
    uploader: 'rn', rating: 4.9, ratings: 11, views: 187, shares: 31,
    created: '1 month ago', date: 'Feb 9, 2026',
  },
  {
    id: 'c9', type: 'doc',
    title: 'Discovery Questions — Financial Services',
    desc: 'Cheat sheet of 40 discovery questions tailored to finserv buyers. Organized by persona (CISO, Head of Risk, Data Platform).',
    tags: ['discovery', 'finserv', 'sales-process', 'enterprise'],
    uploader: 'jt', rating: 4.6, ratings: 19, views: 268, shares: 11,
    created: '5 weeks ago', date: 'Feb 5, 2026',
  },
  {
    id: 'c10', type: 'deck',
    title: 'Technical Deep-Dive — Vector Search Architecture',
    desc: 'Engineer-to-engineer technical deck for the platform team buyer. ANN algorithm tradeoffs, embedding strategy, query latency benchmarks.',
    tags: ['technical-deep-dive', 'vector-search', 'engineering', 'pitch'],
    uploader: 'dh', rating: 4.7, ratings: 16, views: 245, shares: 8, slides: 41,
    created: '6 weeks ago', date: 'Jan 29, 2026',
  },
  {
    id: 'c11', type: 'code',
    title: 'Webhook Receiver — Reference Implementation',
    desc: 'Drop-in Node.js + Python reference for receiving and verifying our webhook events. Used by 6 design partners in production.',
    tags: ['integrations', 'webhooks', 'reference-implementation'],
    uploader: 'ko', rating: 4.5, ratings: 8, views: 156, shares: 4,
    isExternal: true, source: 'GitHub',
    created: '2 months ago', date: 'Jan 18, 2026',
  },
  {
    id: 'c12', type: 'doc',
    title: 'Objection Handling — "We already use OpenAI"',
    desc: 'Concrete responses to the most common objection in technical eval calls. Includes side-by-side benchmark data and four customer quotes.',
    tags: ['objection-handling', 'competitive', 'sales-process'],
    uploader: 'sl', rating: 4.8, ratings: 21, views: 389, shares: 19,
    created: '2 months ago', date: 'Jan 11, 2026',
  },
];

/* tags */
const TAG_FREQ = (() => {
  const counts = {};
  CONTENT.forEach(c => c.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  return Object.entries(counts).sort((a,b) => b[1]-a[1]);
})();

const POPULAR_TAGS = ['enterprise', 'pitch', 'security', 'demo', 'technical-deep-dive', 'integrations', 'finserv', 'migration'];

/* ──────────────────────────────────────────────────────
   Ideas
   ────────────────────────────────────────────────────── */
const IDEAS = [
  {
    id: 'i1',
    title: 'AWS Re:Invent — Interactive Booth Demo',
    summary: 'A hands-on interactive booth experience where prospects can paste their own log volume and see live cost comparisons against our pricing.',
    outline: [
      'Setup: 4-station kiosk with tablet input forms',
      'Live calculator: real-time pricing engine with their numbers',
      'Side-by-side: us vs. Splunk vs. Datadog at their scale',
      'Capture: emailed PDF report + follow-up sequence',
    ],
    createdBy: 'dh', createdAt: '3 days ago', published: false, audience: 'Conference attendees, evaluator persona',
  },
  {
    id: 'i2',
    title: 'CTO 30-min Briefing — Modern Data Stack',
    summary: 'A trim, 6-slide briefing for CTOs of mid-market companies who are reassessing their data platform in 2026.',
    outline: [
      'What changed: 2024-2026 macro shifts in data tooling',
      'The four-layer reference stack',
      'Where most companies trip up (anti-patterns)',
      'A 90-day adoption sequence',
      'Investment envelope: what \"good\" looks like',
      'Q&A primer',
    ],
    createdBy: 'mp', createdAt: '1 week ago', published: true, audience: 'CTOs / VP Eng, 200-2000 person companies',
  },
  {
    id: 'i3',
    title: 'Industry Briefing Pack — Healthcare',
    summary: 'A reusable pack for healthcare deals: HIPAA posture, PHI handling, common architecture patterns, three sanitized customer stories.',
    outline: [
      'Compliance: HIPAA, HITRUST, BAA template',
      'PHI data flow: 3 reference architectures',
      'Case study: Regional health system, 12-week onboarding',
      'Discovery questions tailored to clinical & IT buyers',
      'Pricing & procurement nuances',
    ],
    createdBy: 'jt', createdAt: '2 weeks ago', published: false, audience: 'Healthcare SE pursuit teams',
  },
  {
    id: 'i4',
    title: 'Eval-to-Production Checklist',
    summary: 'A printable one-pager that walks technical buyers through what changes between their POC and their first production deployment.',
    outline: [
      'POC scope vs. production scope (the gaps)',
      'IAM & networking changes',
      'Cost shape changes (and how to forecast)',
      'Operational readiness: alerting, runbooks, escalation',
    ],
    createdBy: 'rn', createdAt: '3 weeks ago', published: false, audience: 'Technical champions post-POC',
  },
];

/* ──────────────────────────────────────────────────────
   Chat history — seeded
   ────────────────────────────────────────────────────── */
const SEED_CHAT = [
  {
    role: 'user',
    body: 'Got a Re:Invent prep call tomorrow with a financial services prospect. Anything we already have for finserv pitches?',
    time: 'Yesterday 4:14 PM',
  },
  {
    role: 'ai',
    body: 'Three things look directly relevant — the discovery questions doc is the highest-signal place to start, especially the CISO and Head of Risk sections.',
    cards: [
      { id: 'c9', relevance: 96, why: 'Persona-targeted' },
      { id: 'c1', relevance: 88, why: 'Compliance posture' },
      { id: 'c12', relevance: 71, why: 'Competitive framing' },
    ],
    time: 'Yesterday 4:14 PM',
  },
];

/* ──────────────────────────────────────────────────────
   Star displays
   ────────────────────────────────────────────────────── */
const Stars = ({ value, size = 'sm', max = 5 }) => {
  const stars = [];
  for (let i = 1; i <= max; i++) {
    stars.push(<Icons.Star key={i} size={size === 'lg' ? 16 : 11} filled={value >= i - 0.5} />);
  }
  return <span className={`stars ${size}`}>{stars}</span>;
};

const StarsInput = ({ value, onChange }) => (
  <span className="stars-input">
    {[1,2,3,4,5].map(i => (
      <button key={i} className={value >= i ? 'filled' : ''} onClick={() => onChange(i)}>
        <Icons.Star size={20} filled />
      </button>
    ))}
  </span>
);

/* ──────────────────────────────────────────────────────
   Poster — typed thumbnail
   ────────────────────────────────────────────────────── */
const PosterGlyph = ({ type }) => {
  const G = {
    deck: <svg viewBox="0 0 100 100"><rect x="14" y="20" width="72" height="48" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M14 32h72" stroke="currentColor" strokeWidth="2"/><path d="M22 42h26M22 50h36M22 58h20" stroke="currentColor" strokeWidth="2"/></svg>,
    video: <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M42 38l22 12-22 12z" fill="currentColor"/></svg>,
    demo: <svg viewBox="0 0 100 100"><rect x="12" y="22" width="76" height="44" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M40 74h20M50 66v8" stroke="currentColor" strokeWidth="2"/><circle cx="30" cy="40" r="3" fill="currentColor"/><path d="M42 40h32M30 50h44" stroke="currentColor" strokeWidth="2"/></svg>,
    doc: <svg viewBox="0 0 100 100"><path d="M28 16h32l16 16v52H28z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M60 16v16h16" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M38 48h32M38 58h32M38 68h22" stroke="currentColor" strokeWidth="2"/></svg>,
    code: <svg viewBox="0 0 100 100"><path d="M36 32L18 50l18 18M64 32l18 18-18 18M56 26l-12 48" fill="none" stroke="currentColor" strokeWidth="2"/></svg>,
  };
  return <div className="poster-glyph">{G[type]}</div>;
};

const Poster = ({ item, showText = false }) => {
  const meta = TYPE_META[item.type];
  return (
    <div className={`card-poster ${meta.poster}`}>
      <PosterGlyph type={item.type} />
      <div className="poster-meta">{meta.label}{item.type === 'deck' && item.slides ? ` · ${item.slides} slides` : ''}</div>
      {item.runtime && <div className="poster-runtime">{item.runtime}</div>}
      {showText && <div className="poster-overlay-text">{item.title}</div>}
    </div>
  );
};

/* helper — find user by id */
const userById = id => USERS[id] || USERS.me;
/* helper — find content by id */
const contentById = id => CONTENT.find(c => c.id === id);

/* Export to window so other JSX scripts can use */
Object.assign(window, {
  Icon, Icons, TYPE_META, USERS, CONTENT, TAG_FREQ, POPULAR_TAGS, IDEAS, SEED_CHAT,
  Avatar, Stars, StarsInput, Poster, PosterGlyph, userById, contentById,
});
