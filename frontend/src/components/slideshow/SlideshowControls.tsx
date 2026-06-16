import { useTranslation } from 'react-i18next';

interface SlideshowControlsProps {
  autoAdvance: boolean;
  autoAdvanceInterval: number;
  onToggleAutoAdvance: () => void;
  onChangeInterval: (interval: number) => void;
}

const INTERVAL_OPTIONS = [
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
];

export function SlideshowControls({
  autoAdvance,
  autoAdvanceInterval,
  onToggleAutoAdvance,
  onChangeInterval,
}: SlideshowControlsProps) {
  const { t } = useTranslation();

  return (
    // MSG-3: Improved slideshow controls with better visibility and clarity
    <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2">
      {/* Auto-advance toggle with label */}
      <button
        onClick={onToggleAutoAdvance}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
          autoAdvance
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-white/20 text-white hover:bg-white/30'
        }`}
        aria-label={
          autoAdvance
            ? t('slideshowControls.aria.pauseSlideshow')
            : t('slideshowControls.aria.playSlideshow')
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {autoAdvance ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          ) : (
            <>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </>
          )}
        </svg>
        <span className="text-sm font-medium">
          {autoAdvance ? t('slideshowControls.actions.pause') : t('slideshowControls.actions.play')}
        </span>
      </button>

      {/* Interval selector with label */}
      <div className="flex items-center gap-2">
        <span className="text-white text-sm font-medium">
          {t('slideshowControls.labels.speed')}
        </span>
        <div className="flex gap-1">
          {INTERVAL_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onChangeInterval(option.value)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                autoAdvanceInterval === option.value
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              aria-label={t('slideshowControls.aria.setSpeed', { speed: option.label })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
