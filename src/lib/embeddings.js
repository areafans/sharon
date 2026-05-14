/**
 * Content extraction + chunking + embedding pipeline.
 *
 * Dispatches by file type:
 *   Text / code       → file.text()
 *   PDF               → pdfjs-dist (per-page text extraction)
 *   PPTX / DOCX       → JSZip (XML text nodes)
 *   Images            → Claude Vision (generates a rich text description)
 *   Video / Audio     → OpenAI Whisper (transcription)
 *   Anything else     → falls back to title + description + tags
 *
 * Each item is split into overlapping chunks and stored as separate rows
 * in content_embeddings so vector search can pinpoint the right passage.
 */

import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { supabase } from './supabase';

// Point pdfjs at the CDN worker so Vite doesn't need to bundle it
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;
export const CHUNK_SIZE    = 2000;  // characters per chunk (~500 tokens)
export const CHUNK_OVERLAP = 200;   // overlap between consecutive chunks
const EMBED_BATCH   = 100;          // max chunks per embeddings API call

export const EMBEDDING_MODEL = 'text-embedding-3-small';

// ─── file type matchers ───────────────────────────────────────────────────────

const EXT_TEXT  = /\.(txt|md|csv|html?|js|ts|jsx|tsx|py|rb|go|java|php|rs|swift|svg|rtf)$/i;
const EXT_PDF   = /\.pdf$/i;
const EXT_PPTX  = /\.(pptx|ppt|key|odp)$/i;
const EXT_DOCX  = /\.(docx|doc|odt)$/i;
const EXT_IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const EXT_VIDEO = /\.(mp4|mov|avi|webm|mkv|m4v)$/i;
const EXT_AUDIO = /\.(mp3|wav|m4a|aac)$/i;

// ─── chunking ─────────────────────────────────────────────────────────────────

export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let i = 0;
  const clean = text.replace(/\s+/g, ' ').trim();
  while (i < clean.length) {
    const chunk = clean.slice(i, i + size).trim();
    if (chunk) chunks.push(chunk);
    i += size - overlap;
  }
  return chunks;
}

// ─── extractors ───────────────────────────────────────────────────────────────

async function extractFromPDF(file) {
  const buffer = await file.arrayBuffer();
  const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages  = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n\n');
}

async function extractFromPPTX(file) {
  const zip    = await JSZip.loadAsync(await file.arrayBuffer());
  const slides = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort();
  const texts = [];
  for (const path of slides) {
    const xml   = await zip.files[path].async('text');
    // Pull text out of <a:t> nodes (DrawingML text runs)
    const parts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map(m => m[1]);
    const text  = parts.join(' ').trim();
    if (text) texts.push(text);
  }
  return texts.join('\n\n');
}

async function extractFromDOCX(file) {
  const zip    = await JSZip.loadAsync(await file.arrayBuffer());
  const docXml = await zip.files['word/document.xml']?.async('text');
  if (!docXml) return '';
  // Pull text out of <w:t> nodes (WordprocessingML text runs)
  const parts = [...docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
  return parts.join(' ');
}

async function describeImage(file) {
  const base64 = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.type || 'image/png',
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Describe this image comprehensively for search indexing in a sales enablement library. ' +
                  'Extract all visible text verbatim. Describe charts, diagrams, screenshots, and key visual ' +
                  'elements in detail. Be thorough — this description is the only representation of this image ' +
                  'in the search index.',
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude Vision failed: ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function transcribeMedia(file) {
  // Whisper API limit is 25 MB
  if (file.size > 24.5 * 1024 * 1024) {
    throw new Error(
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — Whisper API limit is 25 MB. ` +
      'Trim the clip or upload a shorter excerpt.'
    );
  }
  const form = new FormData();
  form.append('file', file);
  form.append('model', 'whisper-1');
  form.append('response_format', 'text');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Whisper transcription failed');
  }
  return res.text();
}

// ─── main extraction dispatcher ───────────────────────────────────────────────

export async function extractText(file, onProgress) {
  const name = file.name;

  if (EXT_TEXT.test(name)) {
    onProgress?.('Reading file text…');
    return file.text();
  }
  if (EXT_PDF.test(name)) {
    onProgress?.('Extracting text from PDF (page by page)…');
    return extractFromPDF(file);
  }
  if (EXT_PPTX.test(name)) {
    onProgress?.('Extracting text from presentation slides…');
    return extractFromPPTX(file);
  }
  if (EXT_DOCX.test(name)) {
    onProgress?.('Extracting text from document…');
    return extractFromDOCX(file);
  }
  if (EXT_IMAGE.test(name)) {
    onProgress?.('Analyzing image with Claude Vision…');
    return describeImage(file);
  }
  if (EXT_VIDEO.test(name) || EXT_AUDIO.test(name)) {
    onProgress?.('Transcribing with OpenAI Whisper…');
    return transcribeMedia(file);
  }

  // Unknown binary (zip, xlsx, etc.) — return null to fall back to metadata
  return null;
}

// ─── embedding + storage ──────────────────────────────────────────────────────

async function embedBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Embeddings API failed');
  }
  const data = await res.json();
  // API returns results sorted by index, so order is guaranteed
  return data.data.map(d => d.embedding);
}

async function embedAllChunks(chunks, onProgress) {
  const embeddings = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    onProgress?.(
      `Embedding chunks ${i + 1}–${Math.min(i + EMBED_BATCH, chunks.length)} of ${chunks.length}…`
    );
    const vecs = await embedBatch(batch);
    embeddings.push(...vecs);
  }
  return embeddings;
}

// ─── extraction type helper ───────────────────────────────────────────────────

function getExtractionType(file) {
  if (!file) return 'metadata';
  const { name } = file;
  if (EXT_TEXT.test(name))                          return 'text';
  if (EXT_PDF.test(name))                           return 'pdf';
  if (EXT_PPTX.test(name))                          return 'pptx';
  if (EXT_DOCX.test(name))                          return 'docx';
  if (EXT_IMAGE.test(name))                         return 'vision';
  if (EXT_VIDEO.test(name) || EXT_AUDIO.test(name)) return 'whisper';
  return 'metadata';
}

// ─── public entry point ───────────────────────────────────────────────────────

/**
 * Full pipeline: extract → chunk → embed → store.
 *
 * @param {File|null} file         The uploaded file (may be null for URL-only items)
 * @param {string}    contentId    UUID of the content_items row
 * @param {{ title, description, tags }} metadata  Used to enrich / fall back
 * @param {Function}  onProgress   (message: string) => void  for UI status updates
 * @returns {{ chunks: number, source: string }}
 */
export async function processContentForEmbedding(file, contentId, metadata, onProgress, chunkSize = CHUNK_SIZE, chunkOverlap = CHUNK_OVERLAP) {
  // 1. Build a metadata header that always goes at the front of the text
  const metaHeader = [
    metadata.title,
    metadata.description,
    Array.isArray(metadata.tags) ? metadata.tags.join(' ') : metadata.tags,
  ].filter(Boolean).join('\n');

  // 2. Extract full text from the file
  let fileText       = null;
  let source         = 'metadata';
  let extractionType = getExtractionType(file);

  if (file) {
    try {
      fileText = await extractText(file, onProgress);
      if (fileText?.trim()) {
        source = file.name;
      } else {
        extractionType = 'metadata'; // extractor returned empty; fall back to metadata
      }
    } catch (err) {
      console.warn(`[embeddings] extraction failed for ${file.name}:`, err.message);
      onProgress?.(`⚠ Could not extract text (${err.message}). Falling back to metadata.`);
      extractionType = 'metadata';
    }
  }

  const fullText = fileText?.trim()
    ? `${metaHeader}\n\n${fileText}`
    : metaHeader;

  if (!fullText.trim()) {
    onProgress?.('No content to embed — skipping.');
    return { chunks: 0, source, extractionType: 'metadata' };
  }

  // 3. Chunk
  onProgress?.('Splitting into chunks…');
  const chunks = chunkText(fullText, chunkSize, chunkOverlap);

  // 4. Embed (in batches)
  const embeddings = await embedAllChunks(chunks, onProgress);

  // 5. Replace any existing embeddings for this item (handles re-uploads)
  await supabase.from('content_embeddings').delete().eq('content_id', contentId);

  // 6. Store
  onProgress?.(`Storing ${chunks.length} embedding${chunks.length !== 1 ? 's' : ''}…`);
  const rows = chunks.map((chunk, i) => ({
    content_id:      contentId,
    chunk_index:     i,
    chunk_text:      chunk,
    embedding:       embeddings[i],
    doc_title:       metadata.title       || null,
    doc_description: metadata.description || null,
  }));

  const { error } = await supabase.from('content_embeddings').insert(rows);
  if (error) throw error;

  return { chunks: chunks.length, source, extractionType };
}
