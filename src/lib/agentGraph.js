// Agent graph orchestration — browser-side coordinator that calls the
// /api/agent endpoint (which is where the LaunchDarkly AI SDK actually runs).
//
// All AI Config evaluation, model invocation, tool execution, and metric
// tracking happens server-side. This file just sequences the two calls
// (orchestrator → specialist) and surfaces routing state to the UI.

import { supabase } from './supabase';

export const AGENT_KEYS = {
  ORCHESTRATOR: 'hub-orchestrator',
  RETRIEVER:    'hub-retriever',
  DEMO_WRITER:  'hub-demo-writer',
  RESEARCHER:   'hub-researcher',
};

export const ROUTE_CONFIG = {
  retrieval:     { label: 'Content Retriever', hint: 'Searching the library…',  agent: AGENT_KEYS.RETRIEVER },
  'demo-writer': { label: 'Demo Writer',        hint: 'Drafting your content…', agent: AGENT_KEYS.DEMO_WRITER },
  researcher:    { label: 'SE Researcher',      hint: 'Searching the web…',     agent: AGENT_KEYS.RESEARCHER },
};

async function callAgentApi({ agentKey, query, history = [], ldContext, userId }) {
  // /api/agent requires a Supabase access token — see api/_lib/auth.js.
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error('Not signed in — cannot call agent API');
  }

  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ agentKey, query, history, ldContext, userId }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Agent ${agentKey} failed (${res.status})`);
  }
  return body;
}

function parseRoutingDecision(text) {
  try {
    const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (['retrieval', 'demo-writer', 'researcher'].includes(parsed.route)) {
      return { route: parsed.route, reason: parsed.reason || '' };
    }
  } catch { /* fall through */ }
  return { route: 'retrieval', reason: 'fallback routing' };
}

/**
 * Run the two-step agent graph:
 *   1. hub-orchestrator → returns route JSON
 *   2. specialist (hub-retriever | hub-demo-writer | hub-researcher) → answers
 *
 * Both calls hit /api/agent, where the LD server-side AI SDK records the
 * metrics that populate the AI Config Monitoring tab.
 *
 * @param {object} params
 * @param {string}   params.query     Current user message
 * @param {Array}    params.history   [{role, content}] conversation history
 * @param {object}   params.ldContext LD evaluation context for both agents
 * @param {string?}  params.userId    Supabase user id (for save_idea_draft tool)
 * @param {Function} [params.onRoute] Called after orchestrator decides
 */
export async function runAgentGraph({ query, history, ldContext, userId, onRoute }) {
  // ── Step 1: Orchestrator ────────────────────────────────────────────────
  const orchResult = await callAgentApi({
    agentKey: AGENT_KEYS.ORCHESTRATOR,
    query,
    history: [],
    ldContext,
    userId,
  });
  const decision = parseRoutingDecision(orchResult.text);

  const routeInfo = ROUTE_CONFIG[decision.route] ?? ROUTE_CONFIG.retrieval;
  onRoute?.({ ...routeInfo, route: decision.route, reason: decision.reason });

  // ── Step 2: Specialist ──────────────────────────────────────────────────
  const specialistResult = await callAgentApi({
    agentKey: routeInfo.agent,
    query,
    history,
    ldContext,
    userId,
  });

  return {
    replyText: specialistResult.text,
    route: decision.route,
    agentLabel: routeInfo.label,
    reason: decision.reason,
    searchResults: specialistResult.searchResults ?? [],
    savedDraft: specialistResult.savedDraft ?? null,
    meta: specialistResult.meta,
  };
}
