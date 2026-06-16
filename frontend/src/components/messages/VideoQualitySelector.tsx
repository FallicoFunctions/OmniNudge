import { useTranslation } from 'react-i18next';
import type { VideoQuality } from '../../types/calls';

interface VideoQualitySelectorProps {
  videoQuality: VideoQuality;
  setVideoQuality: (q: VideoQuality) => void;
}

const QUALITY_OPTIONS: VideoQuality[] = ['low', 'medium', 'high'];

export function VideoQualitySelector({ videoQuality, setVideoQuality }: VideoQualitySelectorProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-1 bg-black/40 rounded-lg px-2 py-1"
      role="group"
      aria-label={t('calls.quality.label', 'Video quality')}
    >
      {QUALITY_OPTIONS.map((q) => (
        <button
          key={q}
          onClick={() => setVideoQuality(q)}
          aria-label={t(`calls.quality.${q}`)}
          aria-pressed={videoQuality === q}
          className={`min-w-[44px] min-h-[44px] px-3 py-1 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
            videoQuality === q
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          {t(`calls.quality.${q}`)}
        </button>
      ))}
    </div>
  );
}
