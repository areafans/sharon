import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icons from './Icons';
import Avatar from './Avatar';
import Poster, { TYPE_META } from './Poster';
import DocPreview from './DocPreview';
import { Stars, StarsInput } from './Stars';

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Comment({ c }) {
  return (
    <div className="comment">
      <Avatar user={c.author} size="sm" />
      <div className="comment-body">
        <div className="comment-head">
          <span className="name">{c.author?.name || c.author?.email || 'Unknown'}</span>
          <span className="time">{timeAgo(c.created_at)}</span>
        </div>
        <div className="comment-text">{c.body}</div>
        <div className="comment-actions">
          <button>REPLY</button>
        </div>
        {c.replies?.length > 0 && (
          <div className="replies">
            {c.replies.map(r => <Comment key={r.id} c={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DetailModal({ item, session, onClose, onShare, onUpdated }) {
  const [userRating, setUserRating] = useState(0);
  const [avgRating, setAvgRating] = useState(item.avg_rating ?? 0);
  const [ratingCount, setRatingCount] = useState(item.rating_count ?? 0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);

  const meta = TYPE_META[item.content_type] || TYPE_META.doc;
  const uploader = item.uploader || {};

  useEffect(() => {
    loadRatings();
    loadComments();
    // Increment view count
    supabase.from('content_items').update({ view_count: (item.view_count ?? 0) + 1 }).eq('id', item.id);
  }, [item.id]);

  async function loadRatings() {
    const userId = session?.user?.id;
    const { data } = await supabase.from('ratings').select('score, user_id').eq('content_id', item.id);
    if (data) {
      const scores = data.map(r => r.score);
      if (scores.length > 0) {
        setAvgRating(scores.reduce((a, b) => a + b, 0) / scores.length);
        setRatingCount(scores.length);
      }
      const mine = data.find(r => r.user_id === userId);
      if (mine) setUserRating(mine.score);
    }
  }

  async function loadComments() {
    const { data } = await supabase
      .from('comments')
      .select('id, body, created_at, parent_id, author:users(id, name, email, avatar_url)')
      .eq('content_id', item.id)
      .order('created_at', { ascending: true });

    if (data) {
      const topLevel = data.filter(c => !c.parent_id);
      const replies = data.filter(c => c.parent_id);
      const withReplies = topLevel.map(c => ({
        ...c,
        replies: replies.filter(r => r.parent_id === c.id),
      }));
      setComments(withReplies);
    }
  }

  async function handleRate(score) {
    setUserRating(score);
    await supabase.from('ratings').upsert(
      { content_id: item.id, user_id: session.user.id, score },
      { onConflict: 'content_id,user_id' }
    );
    loadRatings();
  }

  async function handleComment() {
    if (!commentText.trim()) return;
    setPosting(true);
    await supabase.from('comments').insert({
      content_id: item.id,
      user_id: session.user.id,
      body: commentText.trim(),
    });
    setCommentText('');
    loadComments();
    setPosting(false);
  }

  const isExternal = item.is_external_url;
  const fileUrl = item.file_url;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button className="modal-close" onClick={onClose}><Icons.Close size={16} /></button>
      <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
        <div className="detail-grid">
          <div className="detail-main">
            <div className="detail-type-row">
              <span className="type-dot" style={{ background: meta.color }} />
              <Icons.File size={13} stroke={meta.color} />
              {meta.label}
              {item.is_external_url && <> · External</>}
            </div>
            <h1 className="detail-title">{item.title}</h1>
            {item.description && <p className="detail-desc">{item.description}</p>}

            <div className="detail-preview">
              <DocPreview item={item} />
              <div className="preview-actions">
                <span>Preview · {isExternal ? 'External link' : 'Supabase Storage'}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {fileUrl && (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      {isExternal
                        ? <><Icons.ExternalLink size={13} /> Open link</>
                        : <><Icons.Download size={13} /> Download</>}
                    </a>
                  )}
                  {fileUrl && !isExternal && (
                    <a href={fileUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                      <Icons.ExternalLink size={13} /> Open full
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Your rating</div>
              <div className="rate-row">
                <span className="rate-prompt">
                  {userRating > 0
                    ? `You rated this ${userRating} star${userRating > 1 ? 's' : ''}`
                    : 'How was this for you?'}
                </span>
                <StarsInput value={userRating} onChange={handleRate} />
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-label">
                Comments · {comments.length}
              </div>
              <div className="comment-composer">
                <Avatar user={session?.user} size="sm" />
                <div className="input">
                  <textarea
                    placeholder="Comment, ask a question, or suggest an edit…"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment();
                    }}
                  />
                  <div className="input-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!commentText.trim() || posting}
                      onClick={handleComment}
                    >
                      Post
                    </button>
                  </div>
                </div>
              </div>
              <div className="comment-list">
                {comments.map(c => <Comment key={c.id} c={c} />)}
              </div>
            </div>
          </div>

          <aside className="detail-side">
            <div className="side-actions">
              <button className="btn btn-accent" onClick={onShare}>
                <Icons.Share size={14} /> Generate share link
              </button>
              <button className="btn btn-secondary">
                <Icons.Bookmark size={14} /> Follow updates
              </button>
            </div>

            {avgRating > 0 && (
              <>
                <div className="aggregate-rating">
                  <span className="big">{avgRating.toFixed(1)}</span>
                  <span className="out-of">/ 5.0</span>
                </div>
                <Stars value={avgRating} size="lg" />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {ratingCount} rating{ratingCount !== 1 ? 's' : ''} · {item.view_count ?? 0} views · {item.share_count ?? 0} shares
                </div>
              </>
            )}

            <div style={{ height: 1, background: 'var(--line)', margin: '20px 0' }} />

            <div className="side-row">
              <div className="label">Uploader</div>
              <div className="value">
                <div className="row">
                  <Avatar user={uploader} size="sm" />
                  <div>
                    <div style={{ fontWeight: 500 }}>{uploader.name || uploader.email || 'Unknown'}</div>
                    {uploader.email && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.04em' }}>
                        {uploader.email}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="side-row">
              <div className="label">Added</div>
              <div className="value">{timeAgo(item.created_at)}</div>
            </div>
            <div className="side-row">
              <div className="label">Type</div>
              <div className="value">
                <div className="row" style={{ gap: 6 }}>
                  <Icons.File size={13} stroke={meta.color} /> {meta.label}
                </div>
              </div>
            </div>
            <div className="side-row">
              <div className="label">Source</div>
              <div className="value">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {isExternal ? 'External ↗' : 'Supabase Storage'}
                </span>
              </div>
            </div>
            <div className="side-row">
              <div className="label">Tags</div>
              <div className="value">
                <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  {(item.tags || []).map(t => (
                    <span key={t} className="chip">{t}</span>
                  ))}
                </div>
              </div>
            </div>
            {item.embedding_status === 'complete' && (
              <div className="side-row">
                <div className="label">AI Index</div>
                <div className="value">
                  <span className="chip forest">
                    <Icons.Sparkle size={10} /> {item.embedding_chunk_count ?? '?'} chunks
                  </span>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
