import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { HlsVideo } from './HlsVideo';
import { resolveMediaUrl } from '../../utils/mediaUrl';

export interface MediaLightboxItem {
  url: string;
  media_type?: string;
}

interface MediaLightboxProps {
  items: MediaLightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function MediaLightbox({ items, index, onClose, onIndexChange }: MediaLightboxProps) {
  const { t } = useTranslation();
  const item = items[index];

  if (!item) return null;

  const hasMultiple = items.length > 1;
  const showPrev = () => onIndexChange((index - 1 + items.length) % items.length);
  const showNext = () => onIndexChange((index + 1) % items.length);

  return (
    <Modal isOpen onClose={onClose} closeOnOverlayClick className="relative max-h-[90vh] max-w-[90vw]">
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute -top-10 right-0 text-2xl font-bold text-white hover:opacity-75"
      >
        ✕
      </button>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={showPrev}
            aria-label={t('common.previous')}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-xl text-white hover:bg-black/70"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={showNext}
            aria-label={t('common.next')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-xl text-white hover:bg-black/70"
          >
            ›
          </button>
        </>
      )}

      {item.media_type === 'video' ? (
        <HlsVideo
          src={resolveMediaUrl(item.url) ?? item.url}
          controls
          autoPlay
          className="max-h-[85vh] max-w-[85vw] rounded-lg"
        />
      ) : (
        <img
          src={resolveMediaUrl(item.url)}
          alt=""
          className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
        />
      )}
    </Modal>
  );
}
