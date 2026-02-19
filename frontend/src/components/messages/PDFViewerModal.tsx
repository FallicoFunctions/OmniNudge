import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';

interface PDFViewerModalProps {
  isOpen: boolean;
  pdfUrl: string | null;
  fileName?: string;
  onClose: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

export default function PDFViewerModal({ isOpen, pdfUrl, fileName, onClose }: PDFViewerModalProps) {
  const { t } = useTranslation();
  const [pdfModule, setPdfModule] = useState<typeof import('react-pdf') | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !pdfUrl) return;
    let active = true;
    import('react-pdf')
      .then((mod) => {
        mod.pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
        if (active) {
          setPdfModule(mod);
        }
      })
      .catch(() => {
        if (active) {
          setLoadError(t('messages.media.pdfViewer.loadFailed'));
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen, pdfUrl, t]);

  const pageLabel = useMemo(
    () => t('messages.media.pdfViewer.pageLabel', { current: pageNumber, total: Math.max(numPages, 1) }),
    [numPages, pageNumber, t]
  );

  const resetViewer = () => {
    setPageNumber(1);
    setScale(1);
    setLoadError(null);
  };

  if (!isOpen || !pdfUrl) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetViewer();
        onClose();
      }}
      closeOnOverlayClick
      overlayClassName="bg-black/70"
      className="w-[min(96vw,1200px)] h-[92vh] rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">
            {fileName || t('messages.media.attachmentFallback')}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">{pageLabel}</p>
        </div>
        <button
          type="button"
          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
          onClick={() => {
            resetViewer();
            onClose();
          }}
          aria-label={t('common.accessibility.closeEsc')}
        >
          {t('common.close')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <button
          type="button"
          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
          onClick={() => setPageNumber((prev) => Math.max(1, prev - 1))}
          disabled={pageNumber <= 1}
        >
          {t('messages.media.pdfViewer.prev')}
        </button>
        <button
          type="button"
          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
          onClick={() => setPageNumber((prev) => Math.min(Math.max(numPages, 1), prev + 1))}
          disabled={pageNumber >= numPages}
        >
          {t('messages.media.pdfViewer.next')}
        </button>
        <div className="ml-1 text-xs text-[var(--color-text-muted)]">{pageLabel}</div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
            onClick={() => setScale((prev) => Math.max(MIN_SCALE, prev - SCALE_STEP))}
          >
            {t('messages.media.pdfViewer.zoomOut')}
          </button>
          <div className="text-xs text-[var(--color-text-muted)]">{Math.round(scale * 100)}%</div>
          <button
            type="button"
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
            onClick={() => setScale((prev) => Math.min(MAX_SCALE, prev + SCALE_STEP))}
          >
            {t('messages.media.pdfViewer.zoomIn')}
          </button>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={fileName}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold"
          >
            {t('common.download')}
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loadError ? (
          <div className="rounded border border-[var(--color-error)] bg-[var(--color-error)]/10 p-3 text-sm text-[var(--color-error)]">
            {loadError}
          </div>
        ) : !pdfModule ? (
          <div className="text-sm text-[var(--color-text-muted)]">{t('messages.media.loading')}</div>
        ) : (
          <div className="flex justify-center">
            <pdfModule.Document
              file={pdfUrl}
              onLoadSuccess={(document) => {
                setNumPages(document.numPages);
                setPageNumber(1);
                setLoadError(null);
              }}
              onLoadError={() => {
                setLoadError(t('messages.media.pdfViewer.loadFailed'));
              }}
              loading={<div className="text-sm text-[var(--color-text-muted)]">{t('messages.media.loading')}</div>}
            >
              <pdfModule.Page pageNumber={pageNumber} scale={scale} loading={null} />
            </pdfModule.Document>
          </div>
        )}
      </div>
    </Modal>
  );
}
