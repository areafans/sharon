// Server-side Anthropic proxy. Public POST /api/claude.
//
// Hardened to prevent strangers from racking up Anthropic spend:
//   - Origin must be on the ALLOWED_ORIGINS list (or absent for same-origin).
//   - A valid Supabase access token is required in the Authorization header.
//   - max_tokens is clamped and the model must be on the allow-list; the
//     client cannot pick `claude-opus-4` with a 200k output window.
//
// The Anthropic key is read from CLAUDE_API_KEY (or ANTHROPIC_API_KEY) — the
// VITE_-prefixed fallback is kept temporarily for backwards compatibility while
// existing local checkouts rotate. Remove the fallback once everyone has
// updated their .env.local.

import { guardRequest, isAllowedClaudeModel, clampMaxTokens } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guard = await guardRequest(req);
  if (!guard.ok) {
    return res.status(guard.status).json({ error: guard.error });
  }

  const apiKey =
    process.env.CLAUDE_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.VITE_CLAUDE_API_KEY; // TODO: remove once all envs are rotated
  if (!apiKey) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });
  }

  const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};

  if (!isAllowedClaudeModel(body.model)) {
    return res.status(400).json({ error: `Model not allowed: ${body.model}` });
  }
  body.max_tokens = clampMaxTokens(body.max_tokens);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
