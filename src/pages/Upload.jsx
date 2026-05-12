import { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  processContentForEmbedding,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  EMBEDDING_MODEL,
} from '../lib/embeddings';

const OPENAI_KEY    = import.meta.env.VITE_OPENAI_API_KEY;
const CONTENT_TYPES = ['doc', 'deck', 'video', 'demo', 'code'];

const CONTENT_TYPE_LABELS = {
  doc:   'Document',
  deck:  'Presentation',
  video: 'Video / Audio',
  demo:  'Demo',
  code:  'Code / Web',
};

const EXT_TO_CONTENT_TYPE = {
  pptx: 'deck', ppt: 'deck', key: 'deck', odp: 'deck',
  pdf: 'doc', docx: 'doc', doc: 'doc', odt: 'doc',
  rtf: 'doc', txt: 'doc', md: 'doc',
  xlsx: 'doc', xls: 'doc', csv: 'doc', numbers: 'doc',
  mp4: 'video', mov: 'video', avi: 'video', webm: 'video',
  mkv: 'video', m4v: 'video', mp3: 'video', wav: 'video',
  m4a: 'video', aac: 'video',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code',
  py: 'code', rb: 'code', go: 'code', java: 'code',
  php: 'code', rs: 'code', swift: 'code',
  html: 'code', htm: 'code',
  zip: 'doc', tar: 'doc', gz: 'doc',
  png: 'doc', jpg: 'doc', jpeg: 'doc', gif: 'doc',
  svg: 'doc', webp: 'doc',
};

function detectContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_TO_CONTENT_TYPE[ext] || null;
}

const ACCEPTED_EXTENSIONS = [
  '.pdf', '.pptx', '.ppt', '.key', '.odp',
  '.docx', '.doc', '.odt', '.rtf', '.txt', '.md',
  '.xlsx', '.xls', '.csv', '.numbers',
  '.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v',
  '.mp3', '.wav', '.m4a', '.aac',
  '.html', '.htm', '.js', '.ts', '.jsx', '.tsx',
  '.py', '.rb', '.go', '.java', '.php', '.rs', '.swift',
  '.zip', '.tar', '.gz',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
].join(',');

const TEXT_EXTS = /\.(txt|md|csv|html|htm|js|ts|jsx|tsx|py|rb|go|java|php|rs|swift|rtf)$/i;

// ── Shared AI metadata fetch ──────────────────────────────────────────────────

async function fetchAIMetadata(file) {
  let context = file
    ? `Filename: ${file.name}\nSize: ${(file.size / 1024).toFixed(1)} KB\nMIME type: ${file.type || 'unknown'}`
    : 'No file selected yet.';

  if (file && TEXT_EXTS.test(file.name)) {
    const text = await file.text();
    context += `\n\nContent preview (first 2000 chars):\n${text.slice(0, 2000)}`;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a metadata assistant for a sales enablement content library. ' +
            'Analyze the provided file info and return a JSON object with: ' +
            'title (concise, specific string), ' +
            'description (1-2 sentences about what the content is and who it is useful for), ' +
            'content_type (one of: deck, video, demo, doc, code), ' +
            'tags (array of 3-6 lowercase strings, e.g. ["sales", "q2", "enterprise"]). ' +
            'Be specific and practical for a sales team.',
        },
        { role: 'user', content: context },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error?.message || `OpenAI ${res.status}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ── Main Upload component ─────────────────────────────────────────────────────

export default function Upload({ session, navigate }) {
  // Single upload state
  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [contentType, setContentType]   = useState('doc');
  const [tags, setTags]                 = useState('');
  const [file, setFile]                 = useState(null);
  const [autoDetected, setAutoDetected] = useState(false);
  const [createEmbedding, setCreateEmbedding] = useState(false);
  const [aiUsed, setAiUsed]             = useState(false);
  const [suggesting, setSuggesting]     = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [uploadStep, setUploadStep]     = useState('');
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState(false);

  // Bulk upload state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkQueue, setBulkQueue]         = useState([]);
  const [bulkActive, setBulkActive]       = useState(false);

  const user      = session.user;
  const hasOpenAI = Boolean(OPENAI_KEY);

  // ── AI Suggest (single) ────────────────────────────────────────────────────
  async function handleAISuggest() {
    if (!hasOpenAI) {
      setError('Add VITE_OPENAI_API_KEY to .env.local and restart the dev server.');
      return;
    }
    setSuggesting(true);
    setError('');
    try {
      const suggestion = await fetchAIMetadata(file);
      if (suggestion.title)       setTitle(suggestion.title);
      if (suggestion.description) setDescription(suggestion.description);
      if (CONTENT_TYPES.includes(suggestion.content_type)) setContentType(suggestion.content_type);
      if (Array.isArray(suggestion.tags)) setTags(suggestion.tags.join(', '));
      setAiUsed(true);
    } catch (err) {
      setError(`AI suggest failed: ${err.message}`);
    } finally {
      setSuggesting(false);
    }
  }

  // ── Embedding pipeline (single) ────────────────────────────────────────────
  async function runEmbeddingPipeline(contentId) {
    return processContentForEmbedding(
      file,
      contentId,
      { title, description, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [] },
      (msg) => setUploadStep(msg),
    );
  }

  // ── Submit (single) ────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setUploading(true);

    try {
      let fileUrl = null;

      if (file) {
        setUploadStep('Uploading file to Supabase Storage…');
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path     = `${user.id}/${Date.now()}_${safeName}`;

        const { error: storageErr } = await supabase.storage
          .from('content-files')
          .upload(path, file, { upsert: false });

        if (storageErr) {
          if (/bucket/i.test(storageErr.message)) {
            throw new Error(
              'Bucket "content-files" not found in Supabase Storage.\n' +
              'Fix: Supabase Dashboard → Storage → New Bucket → name: content-files → Public: on → Save.\n' +
              'Then add an INSERT policy: authenticated users, bucket_id = \'content-files\'.'
            );
          }
          throw storageErr;
        }

        fileUrl = supabase.storage.from('content-files').getPublicUrl(path).data.publicUrl;
      }

      setUploadStep('Saving to content library…');
      const { data: inserted, error: insertErr } = await supabase
        .from('content_items')
        .insert({
          title:                title.trim(),
          description:          description.trim() || null,
          content_type:         contentType,
          tags:                 tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          file_url:             fileUrl,
          uploader_id:          user.id,
          file_name:            file?.name ?? null,
          file_size_bytes:      file?.size ?? null,
          file_mime_type:       file?.type || null,
          ai_metadata_generated: aiUsed,
          embedding_status:     'none',
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      if (createEmbedding && hasOpenAI) {
        try {
          const { chunks, source, extractionType } = await runEmbeddingPipeline(inserted.id);
          setUploadStep(`✓ Embedded ${chunks} chunk${chunks !== 1 ? 's' : ''} from ${source}`);
          await supabase.from('content_items').update({
            embedding_status:      'complete',
            embedding_chunk_count: chunks,
            embedding_model:       EMBEDDING_MODEL,
            chunk_size:            CHUNK_SIZE,
            chunk_overlap:         CHUNK_OVERLAP,
            embedded_at:           new Date().toISOString(),
            extraction_source:     extractionType,
          }).eq('id', inserted.id);
        } catch (embErr) {
          await supabase.from('content_items').update({ embedding_status: 'failed' }).eq('id', inserted.id);
          throw embErr;
        }
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setUploadStep('');
    }
  }

  // ── Bulk upload ────────────────────────────────────────────────────────────
  async function handleBulkStart(files, options) {
    // Local metadata tracker (mutable, separate from display state)
    const items = Array.from(files).map(f => ({
      file: f,
      contentType: detectContentType(f.name) || 'doc',
      title: '',
      description: '',
      tags: '',
    }));

    // Initialize the display queue
    setBulkQueue(items.map(item => ({
      file:        item.file,
      status:      'pending',
      step:        '',
      title:       '',
      description: '',
    })));
    setBulkActive(true);

    const update = (i, changes) =>
      setBulkQueue(prev => prev.map((row, idx) => idx === i ? { ...row, ...changes } : row));

    for (let i = 0; i < items.length; i++) {
      try {
        // Step 1 — AI metadata
        update(i, { status: 'ai', step: 'Generating metadata with AI…' });

        if (hasOpenAI) {
          try {
            const suggestion = await fetchAIMetadata(items[i].file);
            if (suggestion.title)       items[i].title       = suggestion.title;
            if (suggestion.description) items[i].description = suggestion.description;
            if (Array.isArray(suggestion.tags)) items[i].tags = suggestion.tags.join(', ');
            if (CONTENT_TYPES.includes(suggestion.content_type)) items[i].contentType = suggestion.content_type;
            update(i, {
              title:       items[i].title,
              description: items[i].description,
              step:        'Metadata ready',
            });
          } catch {
            // Non-fatal: derive title from filename
            items[i].title = items[i].file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
            update(i, { title: items[i].title, step: 'AI failed — using filename' });
          }
        } else {
          items[i].title = items[i].file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
          update(i, { title: items[i].title, step: '' });
        }

        // Step 2 — Upload to Storage
        update(i, { status: 'uploading', step: 'Uploading to Supabase Storage…' });

        const f        = items[i].file;
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path     = `${user.id}/${Date.now()}_${safeName}`;

        const { error: storageErr } = await supabase.storage
          .from('content-files')
          .upload(path, f, { upsert: false });

        if (storageErr) throw storageErr;

        const fileUrl = supabase.storage.from('content-files').getPublicUrl(path).data.publicUrl;

        // Step 3 — Insert content_item row
        update(i, { step: 'Saving to library…' });

        const itemTags = items[i].tags
          ? items[i].tags.split(',').map(t => t.trim()).filter(Boolean)
          : [];

        const { data: inserted, error: insertErr } = await supabase
          .from('content_items')
          .insert({
            title:                 (items[i].title || f.name).trim(),
            description:           items[i].description.trim() || null,
            content_type:          items[i].contentType,
            tags:                  itemTags,
            file_url:              fileUrl,
            uploader_id:           user.id,
            file_name:             f.name,
            file_size_bytes:       f.size,
            file_mime_type:        f.type || null,
            ai_metadata_generated: hasOpenAI,
            embedding_status:      'none',
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;

        // Step 4 — Embeddings (optional)
        if (options.createEmbedding && hasOpenAI) {
          update(i, { status: 'embedding', step: 'Starting embedding pipeline…' });

          try {
            const { chunks, source, extractionType } = await processContentForEmbedding(
              items[i].file,
              inserted.id,
              { title: items[i].title, description: items[i].description, tags: itemTags },
              (msg) => update(i, { step: msg }),
              options.chunkSize,
              options.chunkOverlap,
            );

            await supabase.from('content_items').update({
              embedding_status:      'complete',
              embedding_chunk_count: chunks,
              embedding_model:       EMBEDDING_MODEL,
              chunk_size:            options.chunkSize,
              chunk_overlap:         options.chunkOverlap,
              embedded_at:           new Date().toISOString(),
              extraction_source:     extractionType,
            }).eq('id', inserted.id);

            update(i, {
              status: 'done',
              step:   `✓ ${chunks} chunk${chunks !== 1 ? 's' : ''} embedded · ${extractionType} → ${EMBEDDING_MODEL}`,
            });
          } catch (embErr) {
            await supabase.from('content_items').update({ embedding_status: 'failed' }).eq('id', inserted.id);
            update(i, { status: 'error', step: `Embedding failed: ${embErr.message}` });
          }
        } else {
          update(i, { status: 'done', step: '✓ Saved to library' });
        }
      } catch (err) {
        update(i, { status: 'error', step: `Error: ${err.message}` });
      }
    }
  }

  function resetBulk() {
    setBulkQueue([]);
    setBulkActive(false);
  }

  function resetForm() {
    setTitle(''); setDescription(''); setContentType('doc');
    setTags(''); setFile(null); setAutoDetected(false); setError(''); setSuccess(false);
    setCreateEmbedding(false); setAiUsed(false);
  }

  // ── Bulk progress view ─────────────────────────────────────────────────────
  if (bulkActive) {
    const total     = bulkQueue.length;
    const doneCount = bulkQueue.filter(q => q.status === 'done' || q.status === 'error').length;
    const succeeded = bulkQueue.filter(q => q.status === 'done').length;
    const failed    = bulkQueue.filter(q => q.status === 'error').length;
    const allDone   = doneCount === total && total > 0;
    const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    const barColor = allDone
      ? (failed === 0 ? '#2a7a2a' : '#c8760a')
      : '#1a1a1a';

    return (
      <div style={S.page}>
        <PageHeader navigate={navigate} />
        <main style={{ ...S.main, maxWidth: 700 }}>
          <div style={S.card}>

            {/* Header + overall progress */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <h2 style={S.h2}>
                  {allDone ? 'Upload Complete' : 'Uploading…'}
                </h2>
                <span style={{ fontSize: 13, color: '#666', fontFamily: 'monospace' }}>
                  {doneCount} / {total} files
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: barColor,
                  borderRadius: 3,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                {pct}% complete
                {!allDone && (
                  <span style={{ marginLeft: 8 }}>
                    · {total - doneCount} remaining
                  </span>
                )}
              </div>
            </div>

            {/* Per-file rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 440, overflowY: 'auto' }}>
              {bulkQueue.map((item, i) => {
                const active  = !['pending', 'done', 'error'].includes(item.status);
                const isDone  = item.status === 'done';
                const isError = item.status === 'error';
                const isPending = item.status === 'pending';

                const borderColor = isDone   ? '#b6deb6'
                                  : isError  ? '#fcc'
                                  : active   ? '#c8c8f0'
                                  : '#eee';
                const bgColor     = isDone   ? '#f3fbf3'
                                  : isError  ? '#fff5f5'
                                  : active   ? '#f5f5ff'
                                  : '#fafafa';

                const icon = item.status === 'pending'   ? '○'
                           : item.status === 'ai'        ? '✦'
                           : item.status === 'uploading' ? '↑'
                           : item.status === 'embedding' ? '⬡'
                           : item.status === 'done'      ? '✓'
                           : '✗';

                return (
                  <div key={i} style={{
                    display:     'flex',
                    alignItems:  'flex-start',
                    gap:         10,
                    padding:     '10px 12px',
                    borderRadius: 4,
                    border:      `1px solid ${borderColor}`,
                    background:  bgColor,
                  }}>
                    {/* Status icon */}
                    <span style={{
                      fontSize:   15,
                      lineHeight: '20px',
                      flexShrink: 0,
                      color:      isDone ? '#2a7a2a' : isError ? '#c00' : active ? '#4444cc' : '#bbb',
                      ...(active ? { display: 'inline-block', animation: 'spin 1.4s linear infinite' } : {}),
                    }}>
                      {icon}
                    </span>

                    {/* Content */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize:      13,
                        fontFamily:    'monospace',
                        whiteSpace:    'nowrap',
                        overflow:      'hidden',
                        textOverflow:  'ellipsis',
                        color:         item.title ? '#1a1a1a' : '#888',
                      }}>
                        {item.title || item.file.name}
                      </div>
                      <div style={{
                        fontSize:     11,
                        color:        '#aaa',
                        marginTop:    2,
                        fontFamily:   'monospace',
                        whiteSpace:   'nowrap',
                        overflow:     'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {item.file.name} · {(item.file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                      {item.step && (
                        <div style={{
                          fontSize:   11,
                          color:      isError ? '#c00' : isDone ? '#2a7a2a' : '#555',
                          marginTop:  3,
                          fontFamily: 'monospace',
                        }}>
                          {item.step}
                        </div>
                      )}
                    </div>

                    {isPending && (
                      <span style={{ fontSize: 11, color: '#ccc', flexShrink: 0, paddingTop: 2 }}>
                        queued
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Completion footer */}
            {allDone && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
                <p style={{ fontSize: 14, marginBottom: 0 }}>
                  {succeeded > 0 && (
                    <span style={{ color: '#2a7a2a' }}>
                      ✓ {succeeded} file{succeeded !== 1 ? 's' : ''} uploaded successfully.{' '}
                    </span>
                  )}
                  {failed > 0 && (
                    <span style={{ color: '#c00' }}>
                      ✗ {failed} file{failed !== 1 ? 's' : ''} failed.
                    </span>
                  )}
                </p>
                <div style={S.row}>
                  <button style={S.btnPrimary}   onClick={() => navigate('dashboard')}>View Library</button>
                  <button style={S.btnSecondary} onClick={resetBulk}>Upload More</button>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    );
  }

  // ── Single upload success screen ───────────────────────────────────────────
  if (success) {
    return (
      <div style={S.page}>
        <PageHeader navigate={navigate} />
        <main style={S.main}>
          <div style={S.card}>
            <div style={S.successIcon}>✓</div>
            <h2 style={S.successTitle}>Saved to library</h2>
            <p style={S.muted}>Your content is now visible to the team.</p>
            <div style={S.row}>
              <button style={S.btnPrimary}   onClick={() => navigate('dashboard')}>View Library</button>
              <button style={S.btnSecondary} onClick={resetForm}>Upload Another</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Single upload form ─────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* Bulk modal overlay */}
      {showBulkModal && (
        <BulkUploadModal
          hasOpenAI={hasOpenAI}
          onStart={(files, options) => {
            setShowBulkModal(false);
            handleBulkStart(files, options);
          }}
          onClose={() => setShowBulkModal(false)}
        />
      )}

      <PageHeader navigate={navigate} />
      <main style={S.main}>
        <div style={S.card}>
          <div style={S.formHeader}>
            <h2 style={S.h2}>Upload Content</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                style={S.bulkBtn}
                onClick={() => setShowBulkModal(true)}
              >
                ⬆ Bulk Upload
              </button>
              {hasOpenAI && (
                <button
                  type="button"
                  style={suggesting ? S.aiBtnActive : S.aiBtn}
                  onClick={handleAISuggest}
                  disabled={suggesting}
                >
                  {suggesting ? 'Thinking…' : '✦ AI Suggest'}
                </button>
              )}
              {!hasOpenAI && (
                <span style={S.aiDisabled} title="Add VITE_OPENAI_API_KEY to .env.local">
                  ✦ AI Suggest (key missing)
                </span>
              )}
            </div>
          </div>

          {suggesting && (
            <div style={S.aiStatus}>
              <span style={S.openaiDot} /> Asking <strong>OpenAI gpt-4o-mini</strong>…
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* File */}
            <Field label="File">
              <input
                style={S.fileInput}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={e => {
                  const picked = e.target.files[0] || null;
                  setFile(picked);
                  if (picked) {
                    const detected = detectContentType(picked.name);
                    if (detected) {
                      setContentType(detected);
                      setAutoDetected(true);
                    } else {
                      setAutoDetected(false);
                    }
                  } else {
                    setAutoDetected(false);
                  }
                }}
              />
              {file && (
                <p style={S.fileName}>
                  {file.name} &nbsp;·&nbsp; {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </Field>

            {/* Title */}
            <Field label="Title *">
              <input
                style={S.input}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Q2 Enterprise Sales Deck"
                required
              />
            </Field>

            {/* Description */}
            <Field label="Description">
              <textarea
                style={{ ...S.input, minHeight: 72, resize: 'vertical' }}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this content and who is it for?"
              />
            </Field>

            {/* Content Type */}
            <Field label="Content Type *">
              <div style={{ position: 'relative' }}>
                <select
                  style={S.input}
                  value={contentType}
                  onChange={e => {
                    setContentType(e.target.value);
                    setAutoDetected(false);
                  }}
                >
                  {CONTENT_TYPES.map(t => (
                    <option key={t} value={t}>{CONTENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                {autoDetected && (
                  <span style={S.autoDetectedBadge}>auto-detected</span>
                )}
              </div>
            </Field>

            {/* Tags */}
            <Field label="Tags">
              <input
                style={S.input}
                type="text"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="Comma-separated: enterprise, q2, demo"
              />
            </Field>

            {/* Embeddings toggle */}
            <div style={S.embeddingRow}>
              <label style={S.checkLabel}>
                <input
                  type="checkbox"
                  checked={createEmbedding}
                  onChange={e => setCreateEmbedding(e.target.checked)}
                  disabled={!hasOpenAI}
                  style={{ marginRight: 8 }}
                />
                <span>Generate semantic embedding</span>
              </label>
              {createEmbedding && (
                <span style={S.embeddingProvider}>
                  <span style={S.openaiDot} /> text-embedding-3-small · extracts text from PDF, PPTX, DOCX, images (Vision), video/audio (Whisper)
                </span>
              )}
              {!hasOpenAI && (
                <span style={S.aiDisabled}>(requires VITE_OPENAI_API_KEY)</span>
              )}
            </div>

            {error && <pre style={S.error}>{error}</pre>}

            {uploading && uploadStep && (
              <div style={S.uploadStatus}>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                {uploadStep}
              </div>
            )}

            <button
              type="submit"
              style={uploading ? S.btnDisabled : S.btnPrimary}
              disabled={uploading}
            >
              {uploading ? 'Saving…' : 'Save to Library'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

// ── BulkUploadModal ────────────────────────────────────────────────────────────

function BulkUploadModal({ hasOpenAI, onStart, onClose }) {
  const [files, setFiles]                     = useState([]);
  const [createEmbedding, setCreateEmbedding] = useState(false);
  const [chunkSize, setChunkSize]             = useState(2000);
  const [chunkOverlap, setChunkOverlap]       = useState(200);

  const maxOverlap = Math.min(500, Math.floor(chunkSize * 0.4));

  function handleStart() {
    if (files.length === 0) return;
    onStart(files, { createEmbedding, chunkSize, chunkOverlap });
  }

  const totalMB = (files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2);

  return (
    <div style={S.modalOverlay}>
      <div style={S.modalBox}>

        {/* Header */}
        <div style={S.modalHeader}>
          <h3 style={S.modalTitle}>Bulk Upload</h3>
          <button style={S.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* File picker */}
        <div style={S.field}>
          <label style={S.fieldLabel}>Select Files</label>
          <input
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            onChange={e => setFiles(Array.from(e.target.files))}
            style={S.fileInput}
          />
          {files.length > 0 && (
            <p style={S.fileName}>
              {files.length} file{files.length !== 1 ? 's' : ''} selected &nbsp;·&nbsp; {totalMB} MB total
            </p>
          )}
        </div>

        {/* AI note */}
        <div style={{ ...S.aiStatus, marginBottom: 20 }}>
          <span style={S.openaiDot} />
          <span style={{ fontSize: 12 }}>
            {hasOpenAI
              ? 'GPT-4o-mini will automatically generate title, description, and tags for each file.'
              : 'No OpenAI key detected — titles will be derived from filenames.'}
          </span>
        </div>

        {/* Embedding section */}
        <div style={{ ...S.embeddingRow, flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>

          <label style={{ ...S.checkLabel, fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={createEmbedding}
              onChange={e => setCreateEmbedding(e.target.checked)}
              disabled={!hasOpenAI}
              style={{ marginRight: 8 }}
            />
            <span>Create vector embeddings</span>
            {!hasOpenAI && (
              <span style={{ ...S.aiDisabled, marginLeft: 8 }}>(requires OpenAI key)</span>
            )}
          </label>

          {createEmbedding && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Chunk size slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <label style={S.fieldLabel}>Chunk size</label>
                  <span style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>
                    {chunkSize} chars &nbsp;·&nbsp; ~{Math.round(chunkSize / 4)} tokens
                  </span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={8000}
                  step={100}
                  value={chunkSize}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setChunkSize(v);
                    if (chunkOverlap > Math.floor(v * 0.4)) setChunkOverlap(Math.floor(v * 0.4));
                  }}
                  style={{ width: '100%', accentColor: '#1a1a1a' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#bbb', marginTop: 3 }}>
                  <span>500 — small / precise</span>
                  <span>8000 — large / broad</span>
                </div>
              </div>

              {/* Chunk overlap slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <label style={S.fieldLabel}>Chunk overlap</label>
                  <span style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>
                    {chunkOverlap} chars
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxOverlap}
                  step={10}
                  value={Math.min(chunkOverlap, maxOverlap)}
                  onChange={e => setChunkOverlap(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#1a1a1a' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#bbb', marginTop: 3 }}>
                  <span>0 — no overlap</span>
                  <span>{maxOverlap} — max</span>
                </div>
              </div>

              <p style={{ fontSize: 11, color: '#888', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={S.openaiDot} />
                text-embedding-3-small · PDF, PPTX, DOCX, images (Vision), video/audio (Whisper)
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ ...S.row, marginTop: 20 }}>
          <button
            style={files.length === 0 ? S.btnDisabled : S.btnPrimary}
            disabled={files.length === 0}
            onClick={handleStart}
          >
            Start Upload{files.length > 0 ? ` (${files.length} file${files.length !== 1 ? 's' : ''})` : ''}
          </button>
          <button style={S.btnSecondary} onClick={onClose}>Cancel</button>
        </div>

      </div>
    </div>
  );
}

// ── Page building blocks ───────────────────────────────────────────────────────

function PageHeader({ navigate }) {
  return (
    <header style={S.header}>
      <strong>SE Content Hub</strong>
      <button style={S.backBtn} onClick={() => navigate('dashboard')}>← Library</button>
    </header>
  );
}

function Field({ label, children }) {
  return (
    <div style={S.field}>
      <label style={S.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  page:              { fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif', minHeight: '100vh', background: '#f3f4f6', colorScheme: 'light', color: '#111827' },
  header:            { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', height: 52, borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 },
  backBtn:           { fontSize: 13, cursor: 'pointer', border: 'none', background: 'none', color: '#6b7280', padding: '5px 0', fontFamily: 'inherit' },
  main:              { maxWidth: 640, margin: '32px auto', padding: '0 24px' },
  card:              { padding: 28, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  formHeader:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  h2:                { margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' },
  aiBtn:             { padding: '6px 13px', fontSize: 12, fontFamily: 'inherit', background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', color: '#374151' },
  aiBtnActive:       { padding: '6px 13px', fontSize: 12, fontFamily: 'inherit', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'not-allowed', color: '#9ca3af' },
  bulkBtn:           { padding: '6px 13px', fontSize: 12, fontFamily: 'inherit', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 },
  aiDisabled:        { fontSize: 12, color: '#9ca3af' },
  aiStatus:          { fontSize: 12, color: '#6b7280', marginBottom: 16, padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 },
  openaiDot:         { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10a37f', flexShrink: 0 },
  field:             { marginBottom: 18 },
  fieldLabel:        { display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' },
  input:             { width: '100%', padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', background: '#ffffff', color: '#111827', outline: 'none' },
  fileInput:         { fontSize: 13, fontFamily: 'inherit', color: '#374151' },
  fileName:          { fontSize: 12, color: '#6b7280', marginTop: 6 },
  embeddingRow:      { marginBottom: 20, padding: '12px 14px', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  checkLabel:        { display: 'flex', alignItems: 'center', fontSize: 13, cursor: 'pointer', color: '#374151' },
  embeddingProvider: { fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 },
  error:             { color: '#b91c1c', fontSize: 12, marginBottom: 14, whiteSpace: 'pre-wrap', background: '#fef2f2', padding: 10, borderRadius: 6, border: '1px solid #fecaca' },
  uploadStatus:      { fontSize: 13, color: '#6b7280', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  row:               { display: 'flex', gap: 10, marginTop: 20 },
  btnPrimary:        { padding: '9px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', fontWeight: 500 },
  btnSecondary:      { padding: '9px 20px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' },
  btnDisabled:       { padding: '9px 20px', background: '#d1d5db', color: '#fff', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontSize: 14, fontFamily: 'inherit' },
  successIcon:       { fontSize: 36, color: '#15803d', marginBottom: 8 },
  successTitle:      { margin: '0 0 8px', fontSize: 20, fontWeight: 600, color: '#111827' },
  muted:             { color: '#6b7280', fontSize: 13, margin: '0 0 4px' },
  autoDetectedBadge: { display: 'inline-block', marginTop: 5, fontSize: 11, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 4, padding: '2px 8px', letterSpacing: '0.03em', fontWeight: 500 },
  // Modal
  modalOverlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox:          { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif', colorScheme: 'light', color: '#111827', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' },
  modalHeader:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:        { margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' },
  modalClose:        { border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af', padding: '0 4px', lineHeight: 1 },
};
