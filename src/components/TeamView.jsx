import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';
import Icons from './Icons';

async function apiFetch(path, body, session) {
  const token = session?.access_token;
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function RoleBadge({ role }) {
  return (
    <span className={`role-badge role-badge-${role}`}>
      {role === 'admin' ? <><Icons.Shield size={11} /> Admin</> : 'Member'}
    </span>
  );
}

export default function TeamView({ session, userProfile }) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const isAdmin = userProfile?.role === 'admin';
  const orgId = userProfile?.org_id;

  useEffect(() => {
    if (!orgId) return;
    loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function loadTeam() {
    setLoading(true);
    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, name, email, avatar_url, role, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true }),
      supabase
        .from('org_invitations')
        .select('id, email, status, created_at')
        .eq('org_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);
    setMembers(membersRes.data || []);
    setInvitations(invitesRes.data || []);
    setLoading(false);
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      await apiFetch('/api/invite', { email: inviteEmail.trim() }, session);
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      await loadTeam();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleAction(action, memberId) {
    setActionLoading(`${action}-${memberId}`);
    try {
      await apiFetch('/api/team', { action, memberId }, session);
      await loadTeam();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevokeInvite(invitationId) {
    setActionLoading(`revoke-${invitationId}`);
    try {
      await apiFetch('/api/team', { action: 'revoke_invite', invitationId }, session);
      await loadTeam();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const currentUserId = session?.user?.id;

  if (loading) {
    return (
      <div className="team-view">
        <div className="team-loading">
          <div className="thinking"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="team-view">
      <div className="library-header">
        <div className="library-title-row">
          <div>
            <div className="page-sub">Team · {members.length} {members.length === 1 ? 'member' : 'members'}</div>
            <h1 className="page-title">{userProfile?.org_name || 'My Team'}</h1>
          </div>
        </div>
      </div>

      <div className="team-body">

        {/* Invite form — admins only */}
        {isAdmin && (
          <div className="team-invite-section">
            <h2 className="team-section-label">
              <Icons.UserPlus size={14} /> Invite someone
            </h2>
            <form className="team-invite-form" onSubmit={handleInvite}>
              <div className="team-invite-input-row">
                <input
                  type="email"
                  className="team-invite-input"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={e => {
                    setInviteEmail(e.target.value);
                    setInviteError('');
                    setInviteSuccess('');
                  }}
                  disabled={inviting}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary team-invite-btn"
                  disabled={inviting || !inviteEmail.trim()}
                >
                  {inviting
                    ? <><div className="thinking sm"><span /><span /><span /></div> Sending…</>
                    : <><Icons.Mail size={14} /> Send invite</>}
                </button>
              </div>
              {inviteError && <div className="team-invite-error">{inviteError}</div>}
              {inviteSuccess && <div className="team-invite-success"><Icons.CheckCircle size={14} /> {inviteSuccess}</div>}
            </form>
          </div>
        )}

        {/* Members list */}
        <div className="team-section">
          <h2 className="team-section-label">
            <Icons.Users size={14} /> Members
          </h2>
          <div className="team-members-list">
            {members.map(member => (
              <div key={member.id} className="team-member-row">
                <Avatar user={member} size="md" />
                <div className="team-member-info">
                  <div className="team-member-name">
                    {member.name || member.email.split('@')[0]}
                    {member.id === currentUserId && <span className="team-you-badge">you</span>}
                  </div>
                  <div className="team-member-email">{member.email}</div>
                </div>
                <div className="team-member-right">
                  <RoleBadge role={member.role} />
                  {isAdmin && member.id !== currentUserId && (
                    <div className="team-member-actions">
                      {member.role === 'member' ? (
                        <button
                          className="team-action-btn"
                          title="Promote to admin"
                          disabled={actionLoading === `make_admin-${member.id}`}
                          onClick={() => handleAction('make_admin', member.id)}
                        >
                          <Icons.Shield size={13} />
                          Make admin
                        </button>
                      ) : (
                        <button
                          className="team-action-btn"
                          title="Demote to member"
                          disabled={actionLoading === `make_member-${member.id}`}
                          onClick={() => handleAction('make_member', member.id)}
                        >
                          Make member
                        </button>
                      )}
                      <button
                        className="team-action-btn team-action-btn-danger"
                        title="Remove from team"
                        disabled={actionLoading === `remove-${member.id}`}
                        onClick={() => {
                          if (window.confirm(`Remove ${member.name || member.email} from the team?`)) {
                            handleAction('remove', member.id);
                          }
                        }}
                      >
                        <Icons.Trash size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div className="team-section">
            <h2 className="team-section-label">
              <Icons.Mail size={14} /> Pending invitations
            </h2>
            <div className="team-members-list">
              {invitations.map(inv => (
                <div key={inv.id} className="team-member-row team-member-row-pending">
                  <div className="team-pending-avatar">
                    <Icons.Mail size={16} stroke="var(--muted)" />
                  </div>
                  <div className="team-member-info">
                    <div className="team-member-name">{inv.email}</div>
                    <div className="team-member-email">
                      Invited {new Date(inv.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="team-member-right">
                    <span className="role-badge role-badge-pending">Pending</span>
                    {isAdmin && (
                      <button
                        className="team-action-btn team-action-btn-danger"
                        title="Revoke invitation"
                        disabled={actionLoading === `revoke-${inv.id}`}
                        onClick={() => handleRevokeInvite(inv.id)}
                      >
                        <Icons.Trash size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
