export const LD_CLIENT_ID = import.meta.env.VITE_LAUNCHDARKLY_CLIENT_ID;

// Anthropic does not allow direct browser calls (CORS). All Claude requests route
// through /api/claude — proxied by Vite in dev, handled by a Vercel function in prod.
const CLAUDE_PROXY = '/api/claude';
const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;

/**
 * Build a LaunchDarkly user context from a Supabase session.
 * Starts anonymous before auth, then identifies after login.
 */
export function buildLDContext(session) {
  if (!session?.user) {
    return { kind: 'user', anonymous: true };
  }
  const { id, email, user_metadata: meta = {} } = session.user;
  return {
    kind: 'user',
    key: id,
    email,
    name: meta.name || meta.full_name || email,
    role: meta.role || 'user',
    anonymous: false,
  };
}

/**
 * Default AI config — used when LaunchDarkly is unreachable or
 * the hub-assistant AI Config has no active variation.
 */
export const DEFAULT_AI_CONFIG = {
  model: 'claude-haiku-4-5-20251001',
  provider: 'anthropic',
  maxTokens: 800,
  temperature: 0.7,
  tools: null,
  meta: null,
  systemPrompt: `You are the Hub Assistant for SE Content Hub — an internal content repository for a Solutions Engineering team.

You operate in two modes based on the message:

1. CONTENT DISCOVERY: When someone asks to find, search, or wants to know what exists, search and recommend relevant items from the library context provided.

2. IDEATION / BRAINSTORM: When someone wants to build, create, draft, or brainstorm something new, help them develop a structured idea. Ask clarifying questions first (audience, format, goals), then produce a structured JSON artifact with this shape:
   {"isDraft": true, "title": "...", "summary": "...", "outline": ["section 1", "section 2", ...]}

Always be specific, concise, and actionable. Reference content by title when recommending. If generating a draft artifact, include the JSON inline in your response wrapped in <draft>...</draft> tags.`,
};

/**
 * Parse a LaunchDarkly AI Config variation (from useFlags or ldClient.variation)
 * into a normalised config object the chat components can use directly.
 */
export function parseAIConfig(flagVariation) {
  if (!flagVariation || typeof flagVariation !== 'object') return DEFAULT_AI_CONFIG;

  // Agent mode uses `modelConfigKey` ("Provider.model-name") and `instructions`.
  // Completion mode uses `model.modelName` and `messages[{role:'system'}]`.
  const modelConfigKey = flagVariation?.modelConfigKey; // e.g. "Anthropic.claude-3-5-haiku-20241022"
  const modelFromKey = modelConfigKey?.includes('.')
    ? modelConfigKey.split('.').slice(1).join('.')
    : null;

  const modelName = modelFromKey || flagVariation?.model?.modelName || DEFAULT_AI_CONFIG.model;
  const params = flagVariation?.model?.parameters || {};

  const systemPrompt =
    flagVariation?.instructions                                    // agent mode
    ?? (flagVariation?.messages ?? []).find(m => m.role === 'system')?.content  // completion mode
    ?? DEFAULT_AI_CONFIG.systemPrompt;

  // Tool keys scoped to this agent's variation in LD.
  // null  → legacy / use all defined tools
  // []    → no tools (e.g. the orchestrator router)
  // [...] → specific subset
  const rawTools = flagVariation?.tools;
  const tools = Array.isArray(rawTools)
    ? rawTools.map(t => t.key ?? t.name).filter(Boolean)
    : null;

  const isOpenAI =
    modelName.startsWith('gpt') ||
    modelName.startsWith('o1') ||
    modelName.startsWith('o3');

  // _ldMeta is included by LaunchDarkly when serving an AI Config flag.
  // Fields like `variationKey` and `version` are required for the AI Config
  // monitoring dashboard to attribute events to the right variation.
  const meta = flagVariation?._ldMeta
    ? {
        variationKey: flagVariation._ldMeta.variationKey ?? '',
        version: flagVariation._ldMeta.version ?? 1,
        mode: flagVariation._ldMeta.mode ?? 'completion',
      }
    : null;

  return {
    model: modelName,
    provider: isOpenAI ? 'openai' : 'anthropic',
    maxTokens: params.maxTokens || DEFAULT_AI_CONFIG.maxTokens,
    temperature: params.temperature ?? DEFAULT_AI_CONFIG.temperature,
    systemPrompt,
    tools,
    meta,
  };
}

/**
 * Tool definitions registered in LaunchDarkly.
 * These mirror the schemas created via the LD AI Tools API (sharon project).
 * The model calls these; the component supplies the executor functions.
 */
export const TOOL_DEFINITIONS_CLAUDE = [
  {
    name: 'search_content_library',
    description: 'Semantically search the SE Content Hub library to find relevant content items. Use this to find content the user is looking for or to gather sources before answering.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The semantic search query' },
        limit: { type: 'number', description: 'Max results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'save_idea_draft',
    description: 'Save a structured idea draft to the Ideas board. Use this when the user explicitly asks to save, keep, or bookmark an idea.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The title of the idea' },
        summary: { type: 'string', description: 'A one or two sentence summary' },
        outline: { type: 'array', items: { type: 'string' }, description: 'Ordered list of outline sections' },
      },
      required: ['title', 'summary', 'outline'],
    },
  },
  {
    name: 'get_content_by_tag',
    description: 'Filter the library to return items matching specific tags. Use when the user asks about content in a particular category, vertical, or topic area.',
    input_schema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter by — returns items matching ANY tag' },
      },
      required: ['tags'],
    },
  },
  {
    name: 'get_content_metadata',
    description: 'Retrieve full metadata for a specific content item by ID — title, type, description, tags, uploader, rating, view count.',
    input_schema: {
      type: 'object',
      properties: {
        content_id: { type: 'string', description: 'UUID of the content item' },
      },
      required: ['content_id'],
    },
  },
  {
    name: 'track_content_engagement',
    description: 'Log that a content item was recommended or engaged with. Call this whenever you surface a specific item to the user.',
    input_schema: {
      type: 'object',
      properties: {
        content_id: { type: 'string', description: 'UUID of the content item' },
        interaction_type: { type: 'string', enum: ['recommended', 'clicked', 'saved'], description: 'Type of engagement' },
      },
      required: ['content_id', 'interaction_type'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information: company background, competitor research, industry news, product comparisons, prospect intel. Use for anything requiring up-to-date external data.',
    input_schema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: 'The web search query' },
        num_results: { type: 'number', description: 'Number of results to return (default 5, max 10)' },
      },
      required: ['query'],
    },
  },
];

export const TOOL_DEFINITIONS_OPENAI = TOOL_DEFINITIONS_CLAUDE.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

const MAX_TOOL_ITERATIONS = 6;

/**
 * Unified agentic AI call that routes to Anthropic or OpenAI.
 * Runs a tool-calling loop until the model returns a final text response.
 *
 * @param {object} aiConfig       - Result of parseAIConfig()
 * @param {string} systemPrompt   - System prompt (already injected with RAG context)
 * @param {Array}  history        - [{role, content}] conversation history
 * @param {string} userMessage    - The user's current message
 * @param {object|null} toolExecutors - Map of tool name → async function(args) → string
 * @returns {Promise<string>} The assistant's final reply text
 */
export async function callAI(aiConfig, systemPrompt, history, userMessage, toolExecutors = null) {
  const allowedKeys = aiConfig.tools;
  const filteredClaude = allowedKeys == null
    ? TOOL_DEFINITIONS_CLAUDE
    : TOOL_DEFINITIONS_CLAUDE.filter(t => allowedKeys.includes(t.name));
  const filteredOpenAI = allowedKeys == null
    ? TOOL_DEFINITIONS_OPENAI
    : TOOL_DEFINITIONS_OPENAI.filter(t => allowedKeys.includes(t.function?.name));

  const hasTools = toolExecutors
    && Object.keys(toolExecutors).length > 0
    && filteredClaude.length > 0;

  // Accumulate token usage across all iterations of the tool loop so a single
  // logical "invocation" reports a single set of input/output/total counts.
  const usage = { input: 0, output: 0, total: 0 };

  if (aiConfig.provider === 'openai') {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const body = {
        model: aiConfig.model,
        messages,
        max_tokens: aiConfig.maxTokens,
        temperature: aiConfig.temperature,
      };
      if (hasTools) {
        body.tools = filteredOpenAI;
        body.tool_choice = 'auto';
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
      const data = await res.json();
      const choice = data.choices[0];

      if (data.usage) {
        usage.input  += data.usage.prompt_tokens     ?? 0;
        usage.output += data.usage.completion_tokens ?? 0;
        usage.total  += data.usage.total_tokens      ?? 0;
      }

      if (choice.finish_reason === 'tool_calls') {
        messages.push({
          role: 'assistant',
          content: choice.message.content ?? null,
          tool_calls: choice.message.tool_calls,
        });
        const results = await Promise.all(
          choice.message.tool_calls.map(async tc => {
            const fn = toolExecutors?.[tc.function.name];
            const args = JSON.parse(tc.function.arguments);
            const result = fn ? await fn(args) : JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
            return { role: 'tool', tool_call_id: tc.id, content: result };
          })
        );
        messages.push(...results);
      } else {
        return { text: choice.message.content ?? '', usage };
      }
    }
    throw new Error('Max tool iterations reached');
  }

  // ── Anthropic ──────────────────────────────────────────────────────────────
  const messages = [...history, { role: 'user', content: userMessage }];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const body = {
      model: aiConfig.model,
      system: systemPrompt,
      messages,
      max_tokens: aiConfig.maxTokens,
    };
    if (hasTools) body.tools = filteredClaude;

    const res = await fetch(CLAUDE_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
    const data = await res.json();

    if (data.usage) {
      usage.input  += data.usage.input_tokens  ?? 0;
      usage.output += data.usage.output_tokens ?? 0;
      usage.total  += (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0);
    }

    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content });
      const toolResults = await Promise.all(
        data.content
          .filter(b => b.type === 'tool_use')
          .map(async block => {
            const fn = toolExecutors?.[block.name];
            const result = fn
              ? await fn(block.input)
              : JSON.stringify({ error: `Unknown tool: ${block.name}` });
            return { type: 'tool_result', tool_use_id: block.id, content: result };
          })
      );
      messages.push({ role: 'user', content: toolResults });
    } else {
      const textBlock = data.content.find(b => b.type === 'text');
      return { text: textBlock?.text ?? '', usage };
    }
  }
  throw new Error('Max tool iterations reached');
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Emit the LaunchDarkly AI Config tracking events that populate the AI Config
 * monitoring dashboard. Mirrors @launchdarkly/server-sdk-ai's LDAIConfigTrackerImpl
 * exactly so events from the browser match what the dashboard expects:
 *
 *   - $ld:ai:generation:success / :error — success/failure count
 *   - $ld:ai:duration:total              — duration in ms
 *   - $ld:ai:tokens:input/output/total   — token usage
 *
 * Every event for a single invocation MUST carry the same trackData object
 * (same runId, configKey, variationKey, version, modelName, providerName).
 *
 * @param {object|null} ldClient   - useLDClient() result
 * @param {string}      configKey  - AI Config key (e.g. "hub-orchestrator")
 * @param {object}      aiConfig   - parseAIConfig() result (carries meta + model)
 * @param {object}      result     - { durationMs, success, usage?, errorMessage? }
 */
export function trackAIInvocation(ldClient, configKey, aiConfig, result) {
  if (!ldClient) {
    console.warn('[LD AI] no ldClient — skipping tracking for', configKey);
    return;
  }

  const trackData = {
    runId: uuid(),
    configKey,
    variationKey: aiConfig.meta?.variationKey ?? '',
    version: aiConfig.meta?.version ?? 1,
    modelName: aiConfig.model,
    providerName: aiConfig.provider,
  };

  const events = [
    ['$ld:ai:duration:total', result.durationMs],
    [result.success ? '$ld:ai:generation:success' : '$ld:ai:generation:error', 1],
  ];
  if (result.usage) {
    if (result.usage.total > 0)  events.push(['$ld:ai:tokens:total',  result.usage.total]);
    if (result.usage.input > 0)  events.push(['$ld:ai:tokens:input',  result.usage.input]);
    if (result.usage.output > 0) events.push(['$ld:ai:tokens:output', result.usage.output]);
  }

  console.log(`[LD AI] tracking ${configKey}`, trackData, 'events:', events.map(e => e[0]));
  events.forEach(([key, value]) => ldClient.track(key, trackData, value));

  // Force the events to flush to LaunchDarkly immediately rather than waiting
  // for the next batch interval (default ~5s) so the dashboard updates faster.
  if (typeof ldClient.flush === 'function') {
    ldClient.flush().catch(err => console.warn('[LD AI] flush error:', err.message));
  }
}

/**
 * Filter content items based on the gallery-content-access flag value.
 * mode "all" → show everything (safe default)
 * mode "tags" → show only items that have at least one allowed tag
 */
export function applyContentAccess(items, flagValue) {
  if (!flagValue || flagValue.mode === 'all') return items;
  if (flagValue.mode === 'tags' && Array.isArray(flagValue.allowedTags) && flagValue.allowedTags.length > 0) {
    return items.filter(item =>
      (item.tags || []).some(tag => flagValue.allowedTags.includes(tag))
    );
  }
  return items;
}

/** Human-readable label for the active AI Config variation (for the chat UI footer) */
export function aiConfigLabel(aiConfig) {
  if (!aiConfig || aiConfig.model === DEFAULT_AI_CONFIG.model) return 'Claude Haiku 4.5';
  const modelMap = {
    'claude-opus-4-7':           'Claude Opus 4.7',
    'claude-sonnet-4-6':         'Claude Sonnet 4.6',
    'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
    'claude-sonnet-4-5-20250929':'Claude Sonnet 4.5',
    'claude-opus-4-20250514':    'Claude Opus 4',
    'claude-sonnet-4-20250514':  'Claude Sonnet 4',
    'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
    'claude-3-5-sonnet-20241022':'Claude 3.5 Sonnet',
    'claude-3-haiku-20240307':   'Claude 3 Haiku',
    'gpt-4o':                    'GPT-4o',
    'gpt-4o-mini':               'GPT-4o mini',
    'gpt-4o-mini-2024-07-18':    'GPT-4o mini',
  };
  return modelMap[aiConfig.model] || aiConfig.model;
}
