import { parseAIConfig, callAI, trackAIInvocation } from './launchdarkly';

/**
 * Agent keys match their LD AI Config keys exactly.
 * LaunchDarkly is the control plane — model, prompt, and tools for each
 * agent are configured in the LD UI and served at runtime via useFlags().
 */
export const AGENT_KEYS = {
  ORCHESTRATOR: 'hub-orchestrator',
  RETRIEVER:    'hub-retriever',
  DEMO_WRITER:  'hub-demo-writer',
  RESEARCHER:   'hub-researcher',
};

export const ROUTE_CONFIG = {
  retrieval:     { label: 'Content Retriever', hint: 'Searching the library…', agent: AGENT_KEYS.RETRIEVER },
  'demo-writer': { label: 'Demo Writer',        hint: 'Drafting your content…', agent: AGENT_KEYS.DEMO_WRITER },
  researcher:    { label: 'SE Researcher',      hint: 'Searching the web…',     agent: AGENT_KEYS.RESEARCHER },
};

/**
 * The LaunchDarkly JS Client SDK strips `_ldMeta` from served flag values, so
 * variationKey/version are not available at runtime in the browser. Until LD
 * ships a browser AI SDK, we hardcode the metadata required by the AI Config
 * monitoring dashboard. Each agent config has exactly one variation, so this
 * mapping is unambiguous; bump `version` here when you publish a new variation.
 */
const AGENT_META = {
  [AGENT_KEYS.ORCHESTRATOR]: { variationKey: 'haiku-router',     version: 1 },
  [AGENT_KEYS.RETRIEVER]:    { variationKey: 'haiku-retriever',  version: 1 },
  [AGENT_KEYS.DEMO_WRITER]:  { variationKey: 'sonnet-writer',    version: 1 },
  [AGENT_KEYS.RESEARCHER]:   { variationKey: 'sonnet-researcher',version: 1 },
};

/**
 * Execute a single agent call with full LD AI Config tracking.
 * Emits the reserved $ld:ai:* events required to populate the AI Config
 * monitoring dashboard with invocation count, duration, tokens, success rate.
 */
async function runAgent({ ldClient, configKey, aiConfig, systemPrompt, history, userMessage, toolExecutors }) {
  // Inject the hardcoded variation metadata if the served flag value didn't
  // include it (browser SDKs strip _ldMeta).
  const aiConfigWithMeta = {
    ...aiConfig,
    meta: aiConfig.meta ?? AGENT_META[configKey] ?? null,
  };

  const start = Date.now();
  try {
    const { text, usage } = await callAI(aiConfigWithMeta, systemPrompt, history, userMessage, toolExecutors);
    trackAIInvocation(ldClient, configKey, aiConfigWithMeta, {
      durationMs: Date.now() - start,
      success: true,
      usage,
    });
    return text;
  } catch (err) {
    trackAIInvocation(ldClient, configKey, aiConfigWithMeta, {
      durationMs: Date.now() - start,
      success: false,
      errorMessage: err.message,
    });
    throw err;
  }
}

/** Parse the orchestrator's JSON routing decision; default to retrieval on error. */
function parseRoutingDecision(response) {
  try {
    const cleaned = response.replace(/```(?:json)?\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (['retrieval', 'demo-writer', 'researcher'].includes(parsed.route)) {
      return { route: parsed.route, reason: parsed.reason || '' };
    }
  } catch { /* fall through */ }
  return { route: 'retrieval', reason: 'fallback routing' };
}

/**
 * Run the two-step agent graph:
 *   1. Orchestrator (hub-orchestrator) — classifies intent, returns route JSON
 *   2. Specialist (hub-retriever | hub-demo-writer | hub-researcher) — answers
 *
 * Both agents emit LD AI Config tracking events via trackAIInvocation.
 *
 * @param {object} params
 * @param {object}   params.ldClient       - useLDClient() result (required for tracking)
 * @param {string}   params.query          - Current user message
 * @param {Array}    params.history        - [{role, content}] conversation history
 * @param {object}   params.flags          - Full useFlags() map from LD React SDK
 * @param {object}   params.toolExecutors  - Map of tool name → async fn(args) → string
 * @param {Function} [params.onRoute]      - Called after orchestrator decides:
 *                                            ({ label, hint, reason, route }) => void
 */
export async function runAgentGraph({ ldClient, query, history, flags, toolExecutors, onRoute }) {
  // ── Step 1: Orchestrator ────────────────────────────────────────────────────
  const orchConfig = parseAIConfig(flags[AGENT_KEYS.ORCHESTRATOR]);
  const orchResponse = await runAgent({
    ldClient,
    configKey: AGENT_KEYS.ORCHESTRATOR,
    aiConfig: orchConfig,
    systemPrompt: orchConfig.systemPrompt,
    history: [],
    userMessage: query,
    toolExecutors: null,
  });
  const decision = parseRoutingDecision(orchResponse);

  const routeInfo = ROUTE_CONFIG[decision.route] ?? ROUTE_CONFIG.retrieval;
  onRoute?.({ ...routeInfo, route: decision.route, reason: decision.reason });

  // ── Step 2: Specialist ──────────────────────────────────────────────────────
  const specialistConfig = parseAIConfig(flags[routeInfo.agent]);
  const replyText = await runAgent({
    ldClient,
    configKey: routeInfo.agent,
    aiConfig: specialistConfig,
    systemPrompt: specialistConfig.systemPrompt,
    history,
    userMessage: query,
    toolExecutors,
  });

  return {
    replyText,
    route: decision.route,
    agentLabel: routeInfo.label,
    reason: decision.reason,
  };
}
