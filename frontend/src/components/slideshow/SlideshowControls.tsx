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
  return (
    <div className="flex items-center gap-2">
      {/* Auto-advance toggle */}
      <button
        onClick={onToggleAutoAdvance}
        className={`p-1.5 rounded transition-colors ${
          autoAdvance
            ? 'text-[var(--color-primary)]'
            : 'text-white hover:text-gray-300'
        }`}
        aria-label={autoAdvance ? 'Pause auto-advance' : 'Start auto-advance'}
        title={autoAdvance ? 'Pause' : 'Auto-play'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
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
      </button>

      {/* Interval selector */}
      <div className="flex gap-1">
        {INTERVAL_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChangeInterval(option.value)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              autoAdvanceInterval === option.value
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            aria-label={`Set interval to ${option.label}`}
            title={`Interval: ${option.label}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
