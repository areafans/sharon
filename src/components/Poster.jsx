import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Icons from './Icons';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const TYPE_META = {
  deck:  { label: 'Deck',  icon: 'Deck',  color: 'var(--t-deck)',  poster: 'poster-deck' },
  video: { label: 'Video', icon: 'Video', color: 'var(--t-video)', poster: 'poster-video' },
  demo:  { label: 'Demo',  icon: 'Demo',  color: 'var(--t-demo)',  poster: 'poster-demo' },
  doc:   { label: 'Doc',   icon: 'Doc',   color: 'var(--t-doc)',   poster: 'poster-doc' },
  code:  { label: 'Code',  icon: 'Code',  color: 'var(--t-code)',  poster: 'poster-code' },
};

function getCardFileType(item) {
  const mime = (item?.file_mime_type || '').toLowerCase();
  const name = (item?.file_name || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|webm|avi|m4v|mkv)$/.test(name)) return 'video';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return null;
}

function PdfCardThumbnail({ url }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          obs.disconnect();
          renderPdf();
        }
      },
      { rootMargin: '120px' }
    );
    obs.observe(el);

    async function renderPdf() {
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = canvas.parentElement?.clientWidth || 300;
        const viewport = page.getViewport({ scale: 1 });
        const scale = w / viewport.width;
        const sv = page.getViewport({ scale });
        canvas.width = sv.width;
        canvas.height = sv.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: sv }).promise;
        if (!cancelled) setRendered(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [url]);

  if (failed) return null;

  return (
    <div ref={wrapRef} className="poster-thumb-pdf">
      {!rendered && <div className="poster-thumb-shimmer" />}
      <canvas
        ref={canvasRef}
        className={`poster-thumb-canvas${rendered ? ' visible' : ''}`}
      />
    </div>
  );
}

export default function Poster({ item, showText = false, compact = false }) {
  const type = item?.content_type || item?.type || 'doc';
  const meta = TYPE_META[type] || TYPE_META.doc;
  const IconComp = Icons[meta.icon];
  const runtime = item?.runtime;
  const fileUrl = item?.file_url;
  const cardType = fileUrl && !item?.is_external_url ? getCardFileType(item) : null;

  return (
    <div className={`card-poster ${meta.poster}${compact ? ' card-poster--compact' : ''}`}>
      <div className="poster-meta" style={{ color: meta.color }}>
        {meta.label.toUpperCase()}
      </div>

      {cardType === 'image' && (
        <img
          src={fileUrl}
          alt={item?.title || ''}
          className="poster-thumb-img"
          loading="lazy"
        />
      )}

      {cardType === 'video' && (
        <video
          className="poster-thumb-video"
          src={`${fileUrl}#t=0.001`}
          muted
          preload="metadata"
          playsInline
        />
      )}

      {cardType === 'pdf' && (
        <PdfCardThumbnail url={fileUrl} />
      )}

      {!cardType && (
        <div className="poster-glyph">
          <IconComp size={80} stroke="currentColor" />
        </div>
      )}

      {showText && item?.title && (
        <div className="poster-overlay-text">
          {item.title.length > 40 ? item.title.slice(0, 40) + '…' : item.title}
        </div>
      )}
      {runtime && (
        <div className="poster-runtime">{runtime}</div>
      )}
    </div>
  );
}
