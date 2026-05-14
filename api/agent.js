// Server-side agent runtime — the only place LaunchDarkly AI Configs are evaluated.
//
// Why this exists: AI Config monitoring (Generations, Tokens, Time-to-generate,
// Errors, Costs) only populates from events emitted by an official LaunchDarkly
// AI SDK. The browser SDK (launchdarkly-react-client-sdk) does NOT include AI
// tracking, so we run agents server-side via @launchdarkly/server-sdk-ai and
// expose them to the browser as POST /api/agent.
//
// Flow per call:
//   1. Look up the agent config in LD via aiClient.agentConfig() — returns
//      instructions, model, provider, attached tools, and a tracker.
//   2. Run a Claude tool-calling loop using those instructions + the project's
//      shared tool implementations (Supabase RPC, Tavily, etc.).
//   3. Record duration / token / success metrics on the tracker. These events
//      carry the variation key + version that LD needs to attribute them to
//      the right row on the Monitoring tab.
//
// Works in two environments without changes:
//   - Vercel (prod): serverless function at /api/agent
//   - Vite dev:      mounted as middleware in vite.config.js

import { init } from '@launchdarkly/node-server-sdk';
import { initAi } from '@launchdarkly/server-sdk-ai';
import { createClient } from '@supabase/supabase-js';
import {
  guardRequest,
  isAllowedClaudeModel,
  clampMaxTokens,
  fetchWithTimeout,
  snippetFromResponse,
} from './_lib/auth.js';

// Hard ceiling on total tokens (input + output, summed across all tool-loop
// iterations) for a single /api/agent invocation. Tunable via env var so ops
// can dial it without a code change.
const MAX_TOTAL_TOKENS = Number(process.env.AGENT_TOKEN_BUDGET) || 50_000;

const SDK_KEY        = process.env.LAUNCHDARKLY_SDK_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const OPENAI_KEY     = process.env.OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY;
const CLAUDE_KEY =
  process.env.CLAUDE_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  process.env.VITE_CLAUDE_API_KEY; // TODO: drop the VITE_ fallback once all envs are rotated
const TAVILY_KEY     = process.env.TAVILY_API_KEY ?? process.env.VITE_TAVILY_API_KEY;

// LD client and AI client are initialised once per process and reused across
// invocations. On Vercel a warm function reuses these; in dev the Vite plugin
// keeps them alive for the life of the dev server.
let ldClient = null;
let aiClient = null;
let supabase = null;
let initPromise = null;

async function ensureInitialised() {
  if (aiClient) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!SDK_KEY) throw new Error('LAUNCHDARKLY_SDK_KEY is not set');
    ldClient = init(SDK_KEY);
    await ldClient.waitForInitialization({ timeout: 10 });
    aiClient = initAi(ldClient);
    if (SUPABASE_URL && SUPABASE_KEY) {
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    }
    console.log('[api/agent] LD AI client initialised');
  })();

  return initPromise;
}

// ────────────────────────────────────────────────────────────────────────────
// Tool definitions for Claude — must mirror the keys registered in the LD
// project's AI Tool library (sharon project). The agent variation in LD picks
// which subset is exposed via its `tools` list.
// ────────────────────────────────────────────────────────────────────────────
const TOOL_DEFINITIONS = {
  search_content_library: {
    description: 'Semantically search the Sharon content library to find relevant content items. Use this to find content the user is looking for or to gather sources before answering.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The semantic search query' },
        limit: { type: 'number', description: 'Max results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  save_idea_draft: {
    description: 'Save a structured idea draft to the Ideas board.',
    input_schema: {
      type: 'object',
      properties: {
        title:   { type: 'string' },
        summary: { type: 'string' },
        outline: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'summary', 'outline'],
    },
  },
  get_content_by_tag: {
    description: 'Filter the library to return items matching specific tags.',
    input_schema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['tags'],
    },
  },
  get_content_metadata: {
    description: 'Retrieve full metadata for a specific content item by ID.',
    input_schema: {
      type: 'object',
      properties: {
        content_id: { type: 'string' },
      },
      required: ['content_id'],
    },
  },
  track_content_engagement: {
    description: 'Log that a content item was recommended or engaged with.',
    input_schema: {
      type: 'object',
      properties: {
        content_id: { type: 'string' },
        interaction_type: { type: 'string', enum: ['recommended', 'clicked', 'saved'] },
      },
      required: ['content_id', 'interaction_type'],
    },
  },
  web_search: {
    description: 'Search the web for current information: company background, competitor research, industry news. Use for anything requiring up-to-date external data.',
    input_schema: {
      type: 'object',
      properties: {
        query:       { type: 'string' },
        num_results: { type: 'number' },
      },
      required: ['query'],
    },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Tool implementations — all server-side, using service-role keys.
// Each returns a JSON string the model can read back as a tool_result.
// `ctx` carries the per-request bag (userId, ldContext) needed by stateful tools.
// ────────────────────────────────────────────────────────────────────────────
async function embedText(text) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetchWithTimeout('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings ${res.status}: ${await snippetFromResponse(res)}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

const TOOL_IMPLS = {
  async search_content_library({ query, limit = 5 }, ctx) {
    if (!supabase) return JSON.stringify({ error: 'Supabase not configured' });
    try {
      const embedding = await embedText(query);
      const { data, error } = await supabase.rpc('match_content', {
        query_embedding: embedding,
        match_count: Math.min(limit, 10),
      });
      if (error) throw error;

      const ids = (data ?? []).map(r => r.content_id);
      if (ids.length === 0) return JSON.stringify([]);

      const { data: items } = await supabase
        .from('content_items')
        .select('id, title, content_type, description, tags')
        .in('id', ids);

      const byId = new Map((items ?? []).map(i => [i.id, i]));
      const enriched = (data ?? [])
        .map(r => {
          const item = byId.get(r.content_id);
          if (!item) return null;
          return {
            id: item.id,
            title: item.title,
            type: item.content_type,
            description: item.description,
            tags: item.tags || [],
            similarity: Math.round((r.similarity ?? 0) * 100),
          };
        })
        .filter(Boolean);

      ctx.searchResults = enriched;
      return JSON.stringify(enriched);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },

  async save_idea_draft({ title, summary, outline }, ctx) {
    if (!supabase || !ctx.userId) {
      return JSON.stringify({ error: 'Cannot save — no user context' });
    }
    try {
      const draft = { isDraft: true, title, summary, outline };
      const { error } = await supabase.from('ideas').insert({
        created_by: ctx.userId,
        title,
        artifact: draft,
        published: false,
      });
      if (error) throw error;
      ctx.savedDraft = draft;
      return JSON.stringify({ success: true, message: `Idea "${title}" saved.` });
    } catch (e) {
      return JSON.stringify({ success: false, error: e.message });
    }
  },

  async get_content_by_tag({ tags }) {
    if (!supabase) return JSON.stringify({ error: 'Supabase not configured' });
    try {
      const { data, error } = await supabase
        .from('content_items')
        .select('id, title, content_type, tags')
        .overlaps('tags', tags)
        .limit(10);
      if (error) throw error;
      return JSON.stringify(
        (data ?? []).map(i => ({ id: i.id, title: i.title, type: i.content_type, tags: i.tags || [] }))
      );
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },

  async get_content_metadata({ content_id }) {
    if (!supabase) return JSON.stringify({ error: 'Supabase not configured' });
    try {
      const { data, error } = await supabase
        .from('content_items')
        .select('id, title, content_type, description, tags, created_at, view_count, avg_rating')
        .eq('id', content_id)
        .single();
      if (error) throw error;
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Content item not found' });
    }
  },

  async track_content_engagement({ content_id, interaction_type }, ctx) {
    ldClient?.track('content-engagement',
      ctx.ldContext,
      { content_id, interaction_type, source: 'agent-server' },
    );
    return JSON.stringify({ success: true });
  },

  async web_search({ query, num_results = 5 }) {
    if (!TAVILY_KEY) {
      return JSON.stringify({
        error: 'Web search is not configured.',
        setup: 'Add TAVILY_API_KEY to .env.local — free tier at tavily.com.',
      });
    }
    try {
      const res = await fetchWithTimeout('https://api.tavily.com/search', {
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
      if (!res.ok) throw new Error(`Tavily ${res.status}: ${await snippetFromResponse(res)}`);
      const data = await res.json();
      return JSON.stringify({
        answer: data.answer || null,
        results: (data.results || []).slice(0, num_results).map(r => ({
          title: r.title, url: r.url,
          snippet: r.content?.slice(0, 400),
          published_date: r.published_date,
        })),
      });
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Anthropic call with tool loop. Accumulates token usage across all turns so a
// single agent invocation = one tracker.trackTokens call.
// ────────────────────────────────────────────────────────────────────────────
const MAX_TOOL_ITERATIONS = 6;

async function runClaudeWithTools({ model, system, history, userMessage, allowedTools, maxTokens, ctx }) {
  if (!CLAUDE_KEY) throw new Error('CLAUDE_API_KEY not configured');

  const tools = allowedTools
    .map(name => TOOL_DEFINITIONS[name] ? { name, ...TOOL_DEFINITIONS[name] } : null)
    .filter(Boolean);

  const messages = [...history, { role: 'user', content: userMessage }];
  const usage = { input: 0, output: 0, total: 0 };
  const toolCalls = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const body = {
      model,
      system,
      messages,
      max_tokens: maxTokens,
    };
    if (tools.length > 0) body.tools = tools;

    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Claude API ${res.status}: ${await snippetFromResponse(res, 500)}`);
    }

    const data = await res.json();
    if (data.usage) {
      usage.input  += data.usage.input_tokens  ?? 0;
      usage.output += data.usage.output_tokens ?? 0;
      usage.total  += (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0);
    }

    // Cost ceiling — abort if cumulative token use for this single invocation
    // exceeds the per-message budget. Prevents a runaway tool loop from running
    // up an unexpected Anthropic bill.
    if (usage.total > MAX_TOTAL_TOKENS) {
      throw new Error(
        `Token budget exceeded: ${usage.total} > ${MAX_TOTAL_TOKENS} tokens in one invocation`
      );
    }

    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content });
      const results = await Promise.all(
        data.content
          .filter(b => b.type === 'tool_use')
          .map(async block => {
            toolCalls.push(block.name);
            const impl = TOOL_IMPLS[block.name];
            const result = impl
              ? await impl(block.input, ctx)
              : JSON.stringify({ error: `Unknown tool: ${block.name}` });
            return { type: 'tool_result', tool_use_id: block.id, content: result };
          })
      );
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = (data.content || []).find(b => b.type === 'text')?.text ?? '';
    return { text, usage, toolCalls };
  }

  throw new Error('Max tool iterations reached');
}

// ────────────────────────────────────────────────────────────────────────────
// Main handler. POST /api/agent
//   body: { agentKey, query, history?, ldContext, userId? }
// ────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Anyone who can reach this URL can drive Anthropic spend, so require a valid
  // Supabase access token + an allowed Origin before doing anything expensive.
  const guard = await guardRequest(req);
  if (!guard.ok) {
    return res.status(guard.status).json({ error: guard.error });
  }

  try {
    await ensureInitialised();
  } catch (err) {
    console.error('[api/agent] init failed:', err.message);
    return res.status(500).json({ error: `Init failed: ${err.message}` });
  }

  const { agentKey, query, history = [], ldContext, userId } = req.body || {};
  if (!agentKey || !query) {
    return res.status(400).json({ error: 'agentKey and query are required' });
  }

  // Trust the verified Supabase user over anything the client claims about
  // itself, so a forged userId can't write ideas on someone else's behalf.
  const verifiedUserId = guard.user?.id ?? userId ?? null;

  const context = ldContext ?? { kind: 'user', anonymous: true, key: 'anonymous' };

  let agentConfig;
  try {
    agentConfig = await aiClient.agentConfig(agentKey, context, {
      enabled: true,
      model: { name: 'claude-haiku-4-5-20251001' },
      provider: { name: 'anthropic' },
      instructions: 'You are a helpful assistant.',
    });
  } catch (err) {
    console.error('[api/agent] agentConfig failed:', err.message);
    return res.status(500).json({ error: `agentConfig failed: ${err.message}` });
  }

  if (!agentConfig.enabled) {
    return res.status(400).json({ error: `Agent ${agentKey} is disabled in LaunchDarkly` });
  }

  const tracker = agentConfig.createTracker();
  const trackData = tracker.getTrackData();
  console.log(`[api/agent] ${agentKey} variation=${trackData.variationKey} v${trackData.version} model=${agentConfig.model?.name}`);

  // Tool whitelist — LD's agent variation declares which tools are attached
  // via the `tools` map (keyed by tool name). Empty/missing → no tools.
  const allowedTools = agentConfig.tools ? Object.keys(agentConfig.tools) : [];

  const ctx = {
    userId: verifiedUserId,
    ldContext: context,
    searchResults: [],
    savedDraft: null,
  };

  // The model name comes from LD AI Configs (operator-controlled), so we trust
  // it but still gate on the allow-list to catch typos and prevent a forged
  // config from picking an unsupported / very expensive model.
  const requestedModel = agentConfig.model?.name ?? 'claude-haiku-4-5-20251001';
  const model = isAllowedClaudeModel(requestedModel) ? requestedModel : 'claude-haiku-4-5-20251001';
  const maxTokens = clampMaxTokens(agentConfig.model?.parameters?.maxTokens ?? 1500);

  const start = Date.now();
  try {
    const result = await runClaudeWithTools({
      model,
      system: agentConfig.instructions ?? '',
      history,
      userMessage: query,
      allowedTools,
      maxTokens,
      ctx,
    });

    const durationMs = Date.now() - start;
    tracker.trackDuration(durationMs);
    tracker.trackTokens(result.usage);
    if (result.toolCalls.length > 0) tracker.trackToolCalls(result.toolCalls);
    tracker.trackSuccess();

    if (typeof ldClient.flush === 'function') {
      await ldClient.flush();
    }

    return res.status(200).json({
      text: result.text,
      usage: result.usage,
      toolCalls: result.toolCalls,
      searchResults: ctx.searchResults,
      savedDraft: ctx.savedDraft,
      meta: {
        agentKey,
        variationKey: trackData.variationKey,
        version: trackData.version,
        model,
        durationMs,
      },
    });
  } catch (err) {
    tracker.trackDuration(Date.now() - start);
    tracker.trackError();
    if (typeof ldClient.flush === 'function') await ldClient.flush().catch(() => {});
    console.error(`[api/agent] ${agentKey} failed:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
