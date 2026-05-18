// POST /api/team
// Admin operations on team membership.
//
// Body: { action: 'remove' | 'make_admin' | 'make_member', memberId: string }
//       { action: 'revoke_invite', invitationId: string }
//
// The calling user must be an admin of the same org.

import { createClient } from '@supabase/supabase-js';
import { guardRequest } from './_lib/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guard = await guardRequest(req);
  if (!guard.ok) {
    return res.status(guard.status).json({ error: guard.error });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return res.status(500).json({ error: 'Server is not configured (missing service role key)' });
  }

  // Fetch the calling user's profile
  const { data: callerProfile, error: profileErr } = await adminClient
    .from('users')
    .select('org_id, role')
    .eq('id', guard.user.id)
    .single();

  if (profileErr || !callerProfile) {
    return res.status(403).json({ error: 'Could not verify your profile' });
  }
  if (callerProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can manage team members' });
  }

  const { action, memberId, invitationId } = req.body ?? {};

  // ── Revoke invitation ────────────────────────────────────────────────────
  if (action === 'revoke_invite') {
    if (!invitationId) {
      return res.status(400).json({ error: 'invitationId is required' });
    }
    const { error } = await adminClient
      .from('org_invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId)
      .eq('org_id', callerProfile.org_id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  // All other actions require memberId
  if (!memberId || typeof memberId !== 'string') {
    return res.status(400).json({ error: 'memberId is required' });
  }
  if (memberId === guard.user.id) {
    return res.status(400).json({ error: 'You cannot modify your own membership this way' });
  }

  // Verify the target user is in the same org
  const { data: target, error: targetErr } = await adminClient
    .from('users')
    .select('id, org_id, role')
    .eq('id', memberId)
    .single();

  if (targetErr || !target) {
    return res.status(404).json({ error: 'Member not found' });
  }
  if (target.org_id !== callerProfile.org_id) {
    return res.status(403).json({ error: 'Member is not in your organization' });
  }

  // ── Remove member ────────────────────────────────────────────────────────
  if (action === 'remove') {
    const { error } = await adminClient
      .from('users')
      .update({ org_id: null, role: 'member' })
      .eq('id', memberId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  // ── Promote to admin ─────────────────────────────────────────────────────
  if (action === 'make_admin') {
    const { error } = await adminClient
      .from('users')
      .update({ role: 'admin' })
      .eq('id', memberId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  // ── Demote to member ─────────────────────────────────────────────────────
  if (action === 'make_member') {
    const { error } = await adminClient
      .from('users')
      .update({ role: 'member' })
      .eq('id', memberId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
