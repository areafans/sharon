import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Poster from './Poster';
import Icons from './Icons';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export function getFileType(item) {
  const mime = (item?.file_mime_type || '').toLowerCase();
  const name = (item?.file_name || item?.title || '').toLowerCase();

  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|webm|avi|m4v|mkv)$/.test(name)) return 'video';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/wordprocessingml|msword/.test(mime) || /\.(docx?|odt)$/.test(name)) return 'office';
  if (/presentationml|powerpoint/.test(mime) || /\.(pptx?|key|odp)$/.test(name)) return 'office';
  if (/spreadsheetml|excel/.test(mime) || /\.(xlsx?|ods)$/.test(name)) return 'office';
  return null;
}

function PdfModalViewer({ url }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function renderAll() {
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        const total = pdf.numPages;
        setNumPages(total);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const maxPages = Math.min(total, 8);
        for (let p = 1; p <= maxPages; p++) {
          if (cancelled) return;
          const page = await pdf.getPage(p);
          if (cancelled) return;

          const containerWidth = container.clientWidth || 680;
          const viewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth - 2) / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          canvas.className = 'pdf-modal-page';
          container.appendChild(canvas);

          await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport: scaledViewport,
          }).promise;
        }

        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('Could not render preview');
          setLoading(false);
        }
      }
    }

    renderAll();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="doc-preview-pdf">
      {loading && !error && (
        <div className="doc-preview-loading">
          <span className="doc-spinner" />
          Loading preview…
        </div>
      )}
      {error && (
        <div className="doc-preview-error">
          <Icons.File size={32} />
          <span>{error}</span>
        </div>
      )}
      <div ref={containerRef} className="pdf-pages-container" />
      {!loading && !error && numPages > 8 && (
        <div className="pdf-truncation-note">
          Showing 8 of {numPages} pages — download to view full document
        </div>
      )}
    </div>
  );
}

function OfficeViewer({ url, title }) {
  const [loaded, setLoaded] = useState(false);
  const encoded = encodeURIComponent(url);

  return (
    <div className="doc-preview-iframe-wrap">
      {!loaded && (
        <div className="doc-preview-loading doc-preview-loading-abs">
          <span className="doc-spinner" />
          Loading document viewer…
        </div>
      )}
      <iframe
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encoded}`}
        title={title}
        className="doc-preview-iframe"
        onLoad={() => setLoaded(true)}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}

export default function DocPreview({ item }) {
  const fileUrl = item.file_url;
  const isExternal = item.is_external_url;

  if (!fileUrl || isExternal) {
    return <Poster item={item} showText />;
  }

  const type = getFileType(item);

  if (type === 'image') {
    return (
      <div className="doc-preview-image">
        <img src={fileUrl} alt={item.title} loading="lazy" />
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className="doc-preview-video">
        <video controls preload="metadata">
          <source src={fileUrl} type={item.file_mime_type || undefined} />
        </video>
      </div>
    );
  }

  if (type === 'pdf') {
    return <PdfModalViewer url={fileUrl} />;
  }

  if (type === 'office') {
    return <OfficeViewer url={fileUrl} title={item.title} />;
  }

  return <Poster item={item} showText />;
}
