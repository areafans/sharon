#!/usr/bin/env node
/**
 * Seeds demo content for the admin user:
 *   - 10 content items (mixed types)
 *   - Ratings on each item from all 3 users
 *   - Comments (top-level + replies)
 *   - A chat session with message history
 *   - 2 AI-generated ideas
 *   - A share link on one item
 *
 * Run after seed_users.js:
 *   npm run db:seed:content
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
try {
  const envPath = resolve(__dirname, '../.env.local');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
} catch { /* rely on environment */ }

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY.length < 20) {
  console.error('ERROR: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

// Service-role client bypasses RLS so we can insert on behalf of any user
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── helpers ────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function getUserId(email) {
  // Try public.users first
  const { data } = await supabase.from('users').select('id').eq('email', email).single();
  if (data) return data.id;

  // Fall back to auth admin API (handles case where trigger fired before schema existed)
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const json = await res.json();
  const authUser = (json.users ?? []).find(u => u.email === email);
  if (!authUser) throw new Error(`User not found: ${email} — run npm run db:seed first`);

  // Backfill public.users so foreign keys work
  const { error: insertErr } = await supabase.from('users').insert({
    id: authUser.id,
    email: authUser.email,
    name: authUser.user_metadata?.full_name ?? email.split('@')[0],
  });
  if (insertErr && !/duplicate/.test(insertErr.message)) {
    throw new Error(`Failed to backfill user ${email}: ${JSON.stringify(insertErr)}`);
  }
  console.log(`    ↳ backfilled ${email} into public.users`);
  return authUser.id;
}

// ─── data ────────────────────────────────────────────────────────────────────

const CONTENT_ITEMS = [
  {
    title: 'Q1 2026 Platform Overview Deck',
    description: 'Executive-level slide deck covering the full platform story, positioning, and competitive differentiation for Q1.',
    content_type: 'deck',
    file_url: 'https://docs.google.com/presentation/d/example-q1-platform-overview',
    is_external_url: true,
    tags: ['platform', 'executive', 'Q1', 'overview'],
    created_at: daysAgo(30),
  },
  {
    title: 'Feature Flags 101 — Demo Walkthrough',
    description: 'A live demo recording showing the end-to-end feature flag lifecycle: creation, targeting, rollout, and cleanup.',
    content_type: 'demo',
    file_url: 'https://www.loom.com/share/example-feature-flags-101',
    is_external_url: true,
    tags: ['feature-flags', 'demo', 'onboarding'],
    created_at: daysAgo(25),
  },
  {
    title: 'SDK Integration Guide — React',
    description: 'Step-by-step technical documentation for integrating the React SDK, including context setup, hook usage, and bootstrap patterns.',
    content_type: 'doc',
    file_url: 'https://docs.launchdarkly.com/sdk/client-side/react',
    is_external_url: true,
    tags: ['react', 'sdk', 'integration', 'docs'],
    created_at: daysAgo(22),
  },
  {
    title: 'Competitive Battle Card — Split.io',
    description: 'One-page battle card for handling Split.io objections. Covers pricing, migration effort, and key differentiators.',
    content_type: 'doc',
    file_url: 'https://drive.google.com/file/d/example-split-battlecard',
    is_external_url: true,
    tags: ['competitive', 'split', 'battle-card'],
    created_at: daysAgo(20),
  },
  {
    title: 'Experimentation Platform — Technical Deep Dive',
    description: 'Engineering-focused deck covering the stats engine, assignment consistency, and metric pipelines behind the experimentation product.',
    content_type: 'deck',
    file_url: 'https://docs.google.com/presentation/d/example-experimentation-deep-dive',
    is_external_url: true,
    tags: ['experimentation', 'technical', 'stats', 'engineering'],
    created_at: daysAgo(18),
  },
  {
    title: 'Guarded Rollout Demo — Live Environment',
    description: 'Screen recording of a guarded rollout in action: connecting a metric, watching the automated rollback trigger in real time.',
    content_type: 'video',
    file_url: 'https://www.loom.com/share/example-guarded-rollout',
    is_external_url: true,
    tags: ['guarded-rollout', 'demo', 'video', 'automation'],
    created_at: daysAgo(15),
  },
  {
    title: 'Bootstrapping Flags for Zero Flicker — Code Sample',
    description: 'Minimal Node.js + React example showing server-side bootstrap of flag values to eliminate the flicker on initial page load.',
    content_type: 'code',
    file_url: 'https://github.com/example/ld-bootstrap-sample',
    is_external_url: true,
    tags: ['code', 'bootstrap', 'flicker', 'performance'],
    created_at: daysAgo(12),
  },
  {
    title: 'ROI Calculator — Enterprise Tier',
    description: 'Interactive spreadsheet model for quantifying engineering velocity and incident reduction ROI for enterprise prospects.',
    content_type: 'doc',
    file_url: 'https://docs.google.com/spreadsheets/d/example-roi-calculator',
    is_external_url: true,
    tags: ['roi', 'enterprise', 'calculator', 'value'],
    created_at: daysAgo(10),
  },
  {
    title: 'AI Config Product Launch — Partner Deck',
    description: 'Partner-facing slide deck announcing AI Config GA: key features, pricing, and joint go-to-market motion.',
    content_type: 'deck',
    file_url: 'https://docs.google.com/presentation/d/example-aiconfig-launch',
    is_external_url: true,
    tags: ['ai-config', 'launch', 'partner', 'deck'],
    created_at: daysAgo(7),
  },
  {
    title: 'Mobile SDK — iOS Swift Integration',
    description: 'Code walkthrough and best practices for integrating the iOS Swift SDK in a production app, including background refresh handling.',
    content_type: 'code',
    file_url: 'https://github.com/example/ld-ios-sample',
    is_external_url: true,
    tags: ['ios', 'swift', 'mobile', 'sdk', 'code'],
    created_at: daysAgo(3),
  },
];

const CHAT_MESSAGES = [
  { role: 'user',      content: 'Find me everything we have on experimentation.' },
  { role: 'assistant', content: 'I found 3 relevant pieces of content:\n\n1. **Experimentation Platform — Technical Deep Dive** — Engineering-focused deck covering the stats engine, assignment consistency, and metric pipelines.\n2. **Guarded Rollout Demo — Live Environment** — Screen recording showing a guarded rollout with automated rollback.\n3. **Feature Flags 101 — Demo Walkthrough** — End-to-end feature flag lifecycle demo.\n\nWould you like me to summarize any of these?' },
  { role: 'user',      content: 'Summarize the technical deep dive for me.' },
  { role: 'assistant', content: 'The **Experimentation Platform — Technical Deep Dive** covers three main areas:\n\n- **Stats Engine**: Explains the frequentist approach used for significance testing, including how p-values and confidence intervals are computed at scale.\n- **Assignment Consistency**: Details how users are bucketed deterministically using hashing so flag evaluations remain stable across sessions and devices.\n- **Metric Pipelines**: Walks through how conversion events flow from the SDK through the ingestion layer to the experiment results dashboard.\n\nIt\'s aimed at engineering audiences and is a strong asset for technical evaluations.' },
  { role: 'user',      content: 'Do we have anything to handle Split.io objections?' },
  { role: 'assistant', content: 'Yes — the **Competitive Battle Card — Split.io** is exactly what you need. It covers:\n\n- **Pricing**: Side-by-side comparison at common contract tiers\n- **Migration effort**: Talking points to de-risk the "switching cost" objection\n- **Key differentiators**: Reliability, SDK breadth, experimentation depth, and enterprise support\n\nI can surface the full doc or help you draft talking points tailored to a specific objection.' },
  { role: 'user',      content: 'Draft a cold outreach email for a VP Eng at a fintech company.' },
  { role: 'assistant', content: 'Here\'s a draft:\n\n---\n\n**Subject:** Shipping faster without the fear\n\nHi [Name],\n\nFintech teams I talk to are caught between two pressures: move fast on product and stay bulletproof on reliability. Feature flags solve that — you decouple deploys from releases so your team ships continuously without betting production on every push.\n\nWe work with [similar fintech] to run 50+ experiments a quarter and roll back any release in under 30 seconds. Happy to show you a 20-minute demo tailored to your stack.\n\nWorth a look?\n\n[Your name]\n\n---\n\nWant me to adjust the tone, personalize it further, or generate a few variants?' },
];

const IDEAS = [
  {
    title: 'SDK Quickstart Video Series',
    artifact: {
      type: 'content_plan',
      summary: 'A 5-part short-form video series (3–5 min each) walking through SDK setup for the top 5 languages. Each video ends with a "real scenario" showing the flag in action. Target: developers evaluating the platform.',
      outline: [
        'Part 1: JavaScript/Node.js — basic flag evaluation',
        'Part 2: React — hooks and context setup',
        'Part 3: Python — server-side flags with rollout',
        'Part 4: iOS Swift — mobile considerations',
        'Part 5: Java — enterprise patterns',
      ],
    },
    published: false,
  },
  {
    title: 'Experimentation ROI One-Pager',
    artifact: {
      type: 'document_draft',
      summary: 'A single-page PDF for economic buyers summarizing the business case for experimentation: faster learning cycles, reduced rollback costs, and engineering velocity metrics from customer case studies.',
      sections: ['The cost of guessing', 'What customers measure', 'Typical outcomes', 'Getting started'],
    },
    published: false,
  },
];

// ─── seed ────────────────────────────────────────────────────────────────────

console.log('Fetching user IDs...');
const adminId  = await getUserId('admin@secontenthub.com');
const connorId = await getUserId('connor@secontenthub.com');
const jasonId  = await getUserId('jason@secontenthub.com');
console.log(`  admin=${adminId.slice(0,8)}…  connor=${connorId.slice(0,8)}…  jason=${jasonId.slice(0,8)}…`);

// ── content items ────────────────────────────────────────────────────────────
console.log('\nInserting content items...');
const { data: insertedContent, error: contentError } = await supabase
  .from('content_items')
  .insert(CONTENT_ITEMS.map(item => ({ ...item, uploader_id: adminId })))
  .select('id, title');

if (contentError) throw new Error(`content_items: ${JSON.stringify(contentError)}`);
console.log(`  ✓ ${insertedContent.length} items created`);

// ── ratings ──────────────────────────────────────────────────────────────────
console.log('\nInserting ratings...');

const ratingRows = [];
const ratingScores = {
  [adminId]:  [5, 4, 5, 4, 5, 5, 4, 3, 5, 4],
  [connorId]: [4, 5, 4, 3, 5, 4, 5, 4, 4, 5],
  [jasonId]:  [5, 4, 3, 5, 4, 5, 3, 4, 5, 4],
};

for (const [userId, scores] of Object.entries(ratingScores)) {
  insertedContent.forEach((item, i) => {
    ratingRows.push({ content_id: item.id, user_id: userId, score: scores[i] });
  });
}

const { error: ratingsError } = await supabase.from('ratings').insert(ratingRows);
if (ratingsError) throw new Error(`ratings: ${JSON.stringify(ratingsError)}`);
console.log(`  ✓ ${ratingRows.length} ratings created`);

// ── comments ─────────────────────────────────────────────────────────────────
console.log('\nInserting comments...');

// Top-level comments on the first 4 items
const topLevelComments = [
  { content_id: insertedContent[0].id, user_id: connorId, body: 'Great deck — used this in my last 3 executive intros. Slides 8–12 on competitive differentiation are particularly sharp.' },
  { content_id: insertedContent[0].id, user_id: jasonId,  body: 'Agreed. I\'d love to see an updated version with the new AI Config positioning added to slide 5.' },
  { content_id: insertedContent[1].id, user_id: adminId,  body: 'This demo is gold for mid-funnel prospects who need to see the product before they\'ll engage the technical team.' },
  { content_id: insertedContent[2].id, user_id: jasonId,  body: 'The context setup section is exactly what our React prospects always ask about. Bookmarked.' },
  { content_id: insertedContent[4].id, user_id: connorId, body: 'Sent this to a prospect\'s lead ML engineer and she said it was the clearest explanation of assignment consistency she\'d seen.' },
  { content_id: insertedContent[8].id, user_id: jasonId,  body: 'Timely — just used this for the TechCorp AI pilot kickoff. The joint GTM slide landed really well.' },
];

const { data: insertedComments, error: commentsError } = await supabase
  .from('comments')
  .insert(topLevelComments)
  .select('id');
if (commentsError) throw new Error(`comments: ${JSON.stringify(commentsError)}`);

// One reply to the first comment
const { error: replyError } = await supabase.from('comments').insert({
  content_id: insertedContent[0].id,
  user_id: adminId,
  parent_id: insertedComments[0].id,
  body: 'Good call — I\'ll have an updated version with the AI Config section ready by end of week.',
});
if (replyError) throw new Error(`reply: ${JSON.stringify(replyError)}`);
console.log(`  ✓ ${insertedComments.length + 1} comments created`);

// ── chat session ─────────────────────────────────────────────────────────────
console.log('\nInserting chat session...');

const { data: session, error: sessionError } = await supabase
  .from('chat_sessions')
  .insert({ user_id: adminId })
  .select('id')
  .single();
if (sessionError) throw new Error(`chat_sessions: ${JSON.stringify(sessionError)}`);

const { error: msgsError } = await supabase.from('chat_messages').insert(
  CHAT_MESSAGES.map(m => ({ session_id: session.id, ...m }))
);
if (msgsError) throw new Error(`chat_messages: ${JSON.stringify(msgsError)}`);
console.log(`  ✓ Chat session with ${CHAT_MESSAGES.length} messages created`);

// ── ideas ─────────────────────────────────────────────────────────────────────
console.log('\nInserting ideas...');

const { error: ideasError } = await supabase.from('ideas').insert(
  IDEAS.map(idea => ({ ...idea, created_by: adminId }))
);
if (ideasError) throw new Error(`ideas: ${JSON.stringify(ideasError)}`);
console.log(`  ✓ ${IDEAS.length} ideas created`);

// ── share link ───────────────────────────────────────────────────────────────
console.log('\nInserting share link...');

const { error: shareError } = await supabase.from('share_links').insert({
  content_id: insertedContent[0].id,
  created_by: adminId,
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
});
if (shareError) throw new Error(`share_links: ${JSON.stringify(shareError)}`);
console.log('  ✓ Share link created');

// ── update view/share counts ─────────────────────────────────────────────────
console.log('\nUpdating view and share counts...');

const viewCounts = [142, 87, 203, 56, 118, 94, 41, 78, 167, 33];
for (let i = 0; i < insertedContent.length; i++) {
  await supabase
    .from('content_items')
    .update({ view_count: viewCounts[i], share_count: Math.floor(viewCounts[i] / 8) })
    .eq('id', insertedContent[i].id);
}
console.log('  ✓ View and share counts set');

console.log('\n✅ Content seed complete!');
console.log(`   ${insertedContent.length} content items`);
console.log(`   ${ratingRows.length} ratings`);
console.log(`   ${insertedComments.length + 1} comments`);
console.log(`   1 chat session (${CHAT_MESSAGES.length} messages)`);
console.log(`   ${IDEAS.length} ideas`);
console.log('   1 share link');
