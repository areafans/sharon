import { parseAIConfig, callAI } from './launchdarkly';

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
  retrieval:     { label: 'Content Retriever', hint: 'Searching the library…',           agent: AGENT_KEYS.RETRIEVER },
  'demo-writer': { label: 'Demo Writer',        hint: 'Drafting your content…',           agent: AGENT_KEYS.DEMO_WRITER },
  researcher:    { label: 'SE Researcher',      hint: 'Searching the web…',               agent: AGENT_KEYS.RESEARCHER },
};

/**
 * Parse the orchestrator's JSON routing decision.
 * Falls back to 'retrieval' if the response isn't valid JSON or the route
 * isn't one of the three known values.
 */
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
 * Each agent's model, system prompt, temperature, and tool list comes from
 * its corresponding LD AI Config variation — swappable in the LD UI in real time.
 *
 * @param {object} params
 * @param {string}   params.query          - Current user message
 * @param {Array}    params.history        - [{role, content}] conversation history
 * @param {object}   params.flags          - Full useFlags() map from LD React SDK
 * @param {object}   params.toolExecutors  - Map of tool name → async fn(args) → string
 * @param {Function} params.onRoute        - Called after orchestrator decides:
 *                                           ({ label, hint, reason, route }) => void
 * @returns {Promise<{ replyText, route, agentLabel, reason }>}
 */
export async function runAgentGraph({ query, history, flags, toolExecutors, onRoute }) {
  // ── Step 1: Orchestrator ────────────────────────────────────────────────────
  const orchConfig = parseAIConfig(flags[AGENT_KEYS.ORCHESTRATOR]);
  const orchResponse = await callAI(orchConfig, orchConfig.systemPrompt, [], query, null);
  const decision = parseRoutingDecision(orchResponse);

  const routeInfo = ROUTE_CONFIG[decision.route] ?? ROUTE_CONFIG.retrieval;
  onRoute?.({ ...routeInfo, route: decision.route, reason: decision.reason });

  // ── Step 2: Specialist ──────────────────────────────────────────────────────
  const specialistConfig = parseAIConfig(flags[routeInfo.agent]);
  const replyText = await callAI(
    specialistConfig,
    specialistConfig.systemPrompt,
    history,
    query,
    toolExecutors,
  );

  return {
    replyText,
    route: decision.route,
    agentLabel: routeInfo.label,
    reason: decision.reason,
  };
}
