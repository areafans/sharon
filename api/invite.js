// POST /api/invite
// Sends a Supabase email invitation to a new team member.
//
// Body: { email: string }
//
// The calling user must be an admin. The invitation is recorded in
// org_invitations before the Supabase invite email is sent, so the
// handle_new_user trigger can assign the org when the invitee confirms.

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

  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return res.status(500).json({ error: 'Server is not configured (missing service role key)' });
  }

  // Fetch the calling user's profile to get org_id and verify admin role
  const { data: callerProfile, error: profileErr } = await adminClient
    .from('users')
    .select('org_id, role')
    .eq('id', guard.user.id)
    .single();

  if (profileErr || !callerProfile) {
    return res.status(403).json({ error: 'Could not verify your profile' });
  }
  if (callerProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can invite team members' });
  }
  if (!callerProfile.org_id) {
    return res.status(400).json({ error: 'You are not assigned to an organization' });
  }

  const orgId = callerProfile.org_id;

  // Check the email isn't already in this org
  const { data: existing } = await adminClient
    .from('users')
    .select('id, email')
    .eq('email', email.toLowerCase().trim())
    .eq('org_id', orgId)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'This person is already a member of your team' });
  }

  // Check for a still-pending invitation
  const { data: pendingInvite } = await adminClient
    .from('org_invitations')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .maybeSingle();

  if (pendingInvite) {
    return res.status(409).json({ error: 'An invitation is already pending for this email' });
  }

  // Record the invitation BEFORE calling inviteUserByEmail so the
  // handle_new_user trigger can find it when the auth user is created.
  const { error: inviteRecordErr } = await adminClient
    .from('org_invitations')
    .insert({
      org_id: orgId,
      email: email.toLowerCase().trim(),
      invited_by: guard.user.id,
      status: 'pending',
    });

  if (inviteRecordErr) {
    console.error('[invite] failed to record invitation:', inviteRecordErr.message);
    return res.status(500).json({ error: 'Failed to record invitation' });
  }

  // Determine the app URL for the redirect link in the invite email
  const origin =
    req.headers?.origin ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

  // Send the invitation email via Supabase Auth
  const { error: sendErr } = await adminClient.auth.admin.inviteUserByEmail(
    email.toLowerCase().trim(),
    { redirectTo: `${origin}/` }
  );

  if (sendErr) {
    // Roll back the invitation record so the admin can retry
    await adminClient
      .from('org_invitations')
      .update({ status: 'revoked' })
      .eq('email', email.toLowerCase().trim())
      .eq('org_id', orgId)
      .eq('status', 'pending');

    console.error('[invite] Supabase invite error:', sendErr.message);
    // If the user already exists in Supabase auth, just add them to the org directly
    if (sendErr.message?.includes('already been registered')) {
      // Find the existing auth user and add them to the org
      const { data: existingUser } = await adminClient
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (existingUser) {
        await adminClient
          .from('users')
          .update({ org_id: orgId, role: 'member' })
          .eq('id', existingUser.id);
        return res.json({ ok: true, existing: true });
      }
    }
    return res.status(500).json({ error: `Failed to send invitation: ${sendErr.message}` });
  }

  return res.json({ ok: true });
}
