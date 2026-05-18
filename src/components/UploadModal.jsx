import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { processContentForEmbedding } from '../lib/embeddings';
import Icons from './Icons';
import { TYPE_META } from './Poster';

const TYPES_ARR = [
  { k: 'deck', label: 'Deck' },
  { k: 'video', label: 'Video' },
  { k: 'demo', label: 'Demo' },
  { k: 'doc', label: 'Doc' },
  { k: 'code', label: 'Code' },
];

const TYPE_ICON_BG = {
  deck: 'var(--accent-soft)',
  video: 'var(--forest-soft)',
  demo: 'var(--forest-soft)',
  doc: 'var(--bg-deep)',
  code: 'var(--bg-deep)',
};

export default function UploadModal({ session, onClose, onUploaded }) {
  const [type, setType] = useState('deck');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [sourceState, setSource] = useState('file');
  const source = type === 'code' ? 'external' : sourceState;
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [embedStatus, setEmbedStatus] = useState('');
  const [embedProgress, setEmbedProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function addTag() {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setUploading(true);
    setError('');
    setEmbedProgress(5);

    try {
      let fileUrl = externalUrl.trim() || null;
      let isExternal = source === 'external' || type === 'code';
      let fileName = null;
      let fileSize = null;
      let fileMime = null;

      if (source === 'file' && file) {
        setEmbedStatus('Uploading file…');
        setEmbedProgress(15);
        const path = `${session.user.id}/${Date.now()}-${file.name}`;
        const { data: storageData, error: storageErr } = await supabase.storage
          .from('content-files')
          .upload(path, file, { upsert: false });

        if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

        const { data: urlData } = supabase.storage.from('content-files').getPublicUrl(storageData.path);
        fileUrl = urlData.publicUrl;
        fileName = file.name;
        fileSize = file.size;
        fileMime = file.type;
        setEmbedProgress(30);
      }

      setEmbedStatus('Saving to database…');

      const { data: newItem, error: insertErr } = await supabase
        .from('content_items')
        .insert({
          uploader_id: session.user.id,
          title: title.trim(),
          description: desc.trim() || null,
          content_type: type,
          file_url: fileUrl,
          is_external_url: isExternal,
          tags,
          file_name: fileName,
          file_size_bytes: fileSize,
          file_mime_type: fileMime,
          embedding_status: 'none',
        })
        .select('id')
        .single();

      if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);
      setEmbedProgress(40);

      setEmbedStatus('Generating AI embeddings…');
      try {
        const embedTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Embedding timed out — item saved, search indexing skipped')), 90_000)
        );
        const result = await Promise.race([
          processContentForEmbedding(
            source === 'file' ? file : null,
            newItem.id,
            { title: title.trim(), description: desc.trim(), tags },
            (msg) => setEmbedStatus(msg),
          ),
          embedTimeout,
        ]);

        await supabase.from('content_items').update({
          embedding_status: 'complete',
          embedding_chunk_count: result.chunks,
          embedding_model: 'text-embedding-3-small',
          embedded_at: new Date().toISOString(),
          extraction_source: result.extractionType,
        }).eq('id', newItem.id);

        setEmbedProgress(100);
        setEmbedStatus(`Done — ${result.chunks} chunk${result.chunks !== 1 ? 's' : ''} indexed`);
      } catch (embedErr) {
        console.warn('Embedding failed (non-fatal):', embedErr.message);
        await supabase.from('content_items').update({ embedding_status: 'failed' }).eq('id', newItem.id);
        setEmbedStatus('Embedding skipped — item saved successfully');
        setEmbedProgress(100);
      }

      await new Promise(r => setTimeout(r, 600));
      onUploaded({ id: newItem.id, title, type });
      onClose();
    } catch (err) {
      setError(err.message);
      setEmbedProgress(0);
      setEmbedStatus('');
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = title.trim() && !uploading && (source === 'file' ? (file || type === 'code') : externalUrl.trim());

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button className="modal-close" onClick={onClose}><Icons.Close size={16} /></button>
      <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>

        <div className="upload-head">
          <div className="ai-orb-sm" style={{ width: 28, height: 28 }}>
            <Icons.Upload size={14} />
          </div>
          <div>
            <h2>Add to the hub</h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
              Open by default · No approval needed
            </div>
          </div>
        </div>

        <div className="upload-form">
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--accent-soft)', color: 'var(--accent-deep)', borderRadius: 8, fontSize: 13, border: '1px solid var(--accent-soft)' }}>
              {error}
            </div>
          )}

          <div className="field">
            <label>Content type</label>
            <div className="type-grid">
              {TYPES_ARR.map(t => {
                const M = TYPE_META[t.k];
                const IconComp = Icons[M.icon];
                return (
                  <button
                    key={t.k}
                    type="button"
                    className={`type-card ${type === t.k ? 'active' : ''}`}
                    onClick={() => setType(t.k)}
                  >
                    <div className="type-icon" style={{ background: TYPE_ICON_BG[t.k], color: M.color }}>
                      <IconComp size={16} />
                    </div>
                    <div className="name">{t.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Title</label>
            <input
              type="text"
              placeholder="e.g. Enterprise Security Pitch — Q3"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              placeholder="One or two sentences. What's in it, who it's for."
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>

          <div className="field">
            <label>
              {type === 'code' ? 'GitHub URL' : type === 'video' || type === 'demo' ? 'Source' : 'File'}
            </label>

            {type !== 'code' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${source === 'file' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSource('file')}
                >
                  Upload file
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${source === 'external' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSource('external')}
                >
                  External link {type === 'video' && '(Loom, YouTube, Vimeo)'}
                </button>
              </div>
            )}

            {source === 'file' && type !== 'code' ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files[0])}
                />
                <div
                  className={`dropzone ${dragOver ? 'drag-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  {file ? (
                    <>
                      <div className="icon"><Icons.File size={26} /></div>
                      <div className="primary">{file.name}</div>
                      <div className="secondary">{(file.size / 1024 / 1024).toFixed(1)} MB · click to change</div>
                    </>
                  ) : (
                    <>
                      <div className="icon"><Icons.Upload size={26} /></div>
                      <div className="primary">Drop a file here, or click to browse</div>
                      <div className="secondary">
                        {type === 'video'
                          ? 'Up to 50MB · larger videos: paste a Loom or YouTube link →'
                          : 'Up to 50MB · PDF, PPTX, DOCX, MP4, MOV, ZIP'}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <input
                type="text"
                placeholder={type === 'code' ? 'https://github.com/org/repo' : 'https://…'}
                value={externalUrl}
                onChange={e => setExternalUrl(e.target.value)}
              />
            )}
          </div>

          <div className="field">
            <label>Tags</label>
            <div className="tag-input" onClick={() => document.getElementById('tag-input-field').focus()}>
              {tags.map(t => (
                <span key={t} className="tag-pill">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter(x => x !== t))}>
                    <Icons.Close size={10} />
                  </button>
                </span>
              ))}
              <input
                id="tag-input-field"
                placeholder={tags.length ? '' : 'enterprise, pitch, security…'}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
                  if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1));
                }}
              />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              Freeform tags. Press Enter to add. Reuse existing tags when possible.
            </div>
          </div>

          {uploading && (
            <div>
              <div className="progress-bar-wrap">
                <div className="progress-bar" style={{ width: `${embedProgress}%` }} />
              </div>
              <div className="embed-status">{embedStatus}</div>
            </div>
          )}
        </div>

        <div className="upload-foot">
          <div className="info">
            <Icons.Sparkle size={11} style={{ verticalAlign: 'middle' }} />
            {' '}An embedding is generated on upload — your content becomes discoverable in chat immediately.
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            className="btn btn-accent btn-sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {uploading ? (
              <><div className="thinking"><span /><span /><span /></div> Processing…</>
            ) : (
              <><Icons.Upload size={13} /> Add to hub</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
