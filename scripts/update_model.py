#!/usr/bin/env python3
"""Recreate hub-orchestrator and hub-retriever with updated haiku model."""
import json, urllib.request, urllib.error, sys

API_KEY = "api-337939e8-a61a-4ee2-90cb-f1e4b8a81937"
PROJECT = "sharon"
NEW_MODEL_KEY = "Anthropic.claude-haiku-4-5-20251001"

def api(method, path, body=None):
    url = f"https://app.launchdarkly.com/api/v2{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method,
        headers={"Authorization": API_KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        print(f"  HTTP {e.code}: {msg[:300]}", file=sys.stderr)
        return None

ORCHESTRATOR_INSTRUCTIONS = (
    "You are a routing agent for the SE Content Hub assistant. Your only job is to classify "
    "the user's intent and return a JSON routing decision.\n\n"
    "Routing options:\n"
    '- "retrieval" \u2014 user wants to find, search, or browse existing content in the library\n'
    '- "demo-writer" \u2014 user wants to create, write, draft, or brainstorm a new artifact '
    "(demo script, slide deck, presentation, briefing, talk track)\n"
    '- "researcher" \u2014 user wants external information: competitor research, prospect background, '
    "industry news, pricing, company info, or anything requiring web search\n\n"
    'Respond ONLY with valid JSON in this exact shape:\n'
    '{"route": "retrieval" | "demo-writer" | "researcher", "reason": "one sentence explanation"}\n\n'
    "No other text. No markdown. Just the JSON object."
)

RETRIEVER_INSTRUCTIONS = (
    "You are the Content Retrieval specialist for the SE Content Hub. "
    "Find the most relevant content from the library for the user's needs.\n\n"
    "Behavior:\n"
    "1. Use search_content_library to semantically search for relevant content\n"
    "2. Use get_content_by_tag when the user mentions specific categories, verticals, or topics\n"
    "3. Use get_content_metadata to get full detail on a specific item if needed\n"
    "4. Present results clearly: title, type, why it's relevant, and any key tags\n"
    "5. Surface the top 3 matches with a brief explanation of why each fits\n"
    "6. If results are weak, say so and suggest better search terms\n\n"
    "Be concise. Format output as readable prose, not JSON."
)

configs = [
    {
        "config_key": "hub-orchestrator",
        "config_name": "Hub Orchestrator",
        "config_desc": "Entry-point routing agent. Classifies user intent and selects the specialist agent.",
        "var_key": "haiku-router",
        "var_name": "Haiku Router",
        "instructions": ORCHESTRATOR_INSTRUCTIONS,
        "tools": [],
        "params": {"maxTokens": 200, "temperature": 0.1},
    },
    {
        "config_key": "hub-retriever",
        "config_name": "Hub Content Retriever",
        "config_desc": "Specialist agent for content discovery. Searches the SE library.",
        "var_key": "haiku-retriever",
        "var_name": "Haiku Retriever",
        "instructions": RETRIEVER_INSTRUCTIONS,
        "tools": [
            {"key": "search_content_library", "version": 1},
            {"key": "get_content_by_tag", "version": 1},
            {"key": "get_content_metadata", "version": 1},
            {"key": "track_content_engagement", "version": 1},
        ],
        "params": {"maxTokens": 1000, "temperature": 0.3},
    },
]

for cfg in configs:
    ck = cfg["config_key"]
    print(f"\nRecreating {ck}...")

    # 1. Delete the whole config
    result = api("DELETE", f"/projects/{PROJECT}/ai-configs/{ck}")
    print(f"  deleted config")

    # 2. Recreate config as agent mode
    new_config = api("POST", f"/projects/{PROJECT}/ai-configs", {
        "key": ck,
        "name": cfg["config_name"],
        "description": cfg["config_desc"],
        "mode": "agent",
        "tags": ["se-content-hub", "agent-graph"],
    })
    if not new_config or not new_config.get("key"):
        print(f"  ✗ failed to recreate config"); continue
    print(f"  ✓ config mode={new_config.get('mode')}")

    # 3. Add variation with new model
    var = api("POST", f"/projects/{PROJECT}/ai-configs/{ck}/variations", {
        "key": cfg["var_key"],
        "name": cfg["var_name"],
        "modelConfigKey": NEW_MODEL_KEY,
        "model": {"custom": {}, "modelName": "", "parameters": cfg["params"]},
        "instructions": cfg["instructions"],
        "tools": cfg["tools"],
    })
    if var and var.get("key"):
        print(f"  ✓ variation {var['key']} → {NEW_MODEL_KEY}")
    else:
        print(f"  ✗ failed to create variation")
