import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icons from './Icons';

async function sha256(text) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getExpiresAt(value) {
  if (!value || value === 'never') return null;
  const now = new Date();
  const map = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };
  return new Date(now.getTime() + (map[value] || 0)).toISOString();
}

export default function ShareModal({ item, session, onClose }) {
  const [withPw, setWithPw] = useState(false);
  const [withExpiry, setWithExpiry] = useState(true);
  const [pw, setPw] = useState('');
  const [expiry, setExpiry] = useState('7d');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    generateLink();
  }, []);

  async function generateLink() {
    setGenerating(true);
    setError('');
    try {
      const token = crypto.randomUUID();
      const passwordHash = withPw && pw ? await sha256(pw) : null;
      const expiresAt = withExpiry ? getExpiresAt(expiry) : null;

      const { error: insertErr } = await supabase.from('share_links').insert({
        content_id: item.id,
        created_by: session.user.id,
        token,
        password_hash: passwordHash,
        expires_at: expiresAt,
      });

      if (insertErr) throw new Error(insertErr.message);

      // Increment share count
      await supabase.from('content_items')
        .update({ share_count: (item.share_count ?? 0) + 1 })
        .eq('id', item.id);

      setShareUrl(`${window.location.origin}/share/${token}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button className="modal-close" onClick={onClose}><Icons.Close size={16} /></button>
      <div className="modal share-modal" onClick={e => e.stopPropagation()}>
        <div className="upload-head">
          <div className="ai-orb-sm" style={{ width: 28, height: 28, background: 'var(--ink)' }}>
            <Icons.Share size={14} />
          </div>
          <div>
            <h2>Share externally</h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
              {item.title.slice(0, 50)}{item.title.length > 50 ? '…' : ''}
            </div>
          </div>
        </div>

        <div className="upload-form" style={{ paddingBottom: 12 }}>
          {error && (
            <div style={{ padding: '9px 12px', background: 'var(--accent-soft)', color: 'var(--accent-deep)', borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div className="field">
            <label>Public link</label>
            <div className="share-link-box">
              <Icons.Link size={13} stroke="var(--muted)" />
              <span className="url">
                {generating ? 'Generating link…' : (shareUrl || 'Failed to generate')}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={handleCopy} disabled={!shareUrl}>
                {copied
                  ? <><Icons.Check size={12} /> Copied</>
                  : <><Icons.Copy size={12} /> Copy</>}
              </button>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
              UUID TOKEN · NO ACCOUNT REQUIRED FOR RECIPIENT
            </div>
          </div>

          <div className="share-toggles">
            <div className="share-toggle">
              <div className={`switch ${withPw ? 'on' : ''}`} onClick={() => setWithPw(!withPw)} />
              <div className="toggle-input">
                <div className="toggle-title">Password protect</div>
                <div className="toggle-sub">SHA-256 HASHED · REGENERATES LINK</div>
                {withPw && (
                  <input
                    type="text"
                    placeholder="Set a password"
                    value={pw}
                    onChange={e => setPw(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="share-toggle">
              <div className={`switch ${withExpiry ? 'on' : ''}`} onClick={() => setWithExpiry(!withExpiry)} />
              <div className="toggle-input">
                <div className="toggle-title">Set expiry</div>
                <div className="toggle-sub">ENFORCED SERVER-SIDE</div>
                {withExpiry && (
                  <select value={expiry} onChange={e => setExpiry(e.target.value)}>
                    <option value="24h">Expires in 24 hours</option>
                    <option value="7d">Expires in 7 days</option>
                    <option value="30d">Expires in 30 days</option>
                    <option value="never">No expiry</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {(withPw || withExpiry) && (
            <button className="btn btn-secondary btn-sm" onClick={generateLink} disabled={generating}>
              <Icons.Refresh size={13} /> Regenerate link with new settings
            </button>
          )}
        </div>

        <div className="upload-foot">
          <div className="info">
            <Icons.Lock size={11} style={{ verticalAlign: 'middle' }} />
            {' '}Share count: {(item.share_count ?? 0) + 1}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
