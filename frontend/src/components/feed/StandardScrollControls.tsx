import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface StandardScrollControlsProps {
  autoAdvance: boolean;
  autoAdvanceInterval: number;
  currentIndex: number;
  totalPosts: number;
  hasMore: boolean;
  onToggleAutoAdvance: () => void;
  onChangeInterval: (interval: number) => void;
  onNext: () => void;
  onPrevious: () => void;
}

export function StandardScrollControls({
  autoAdvance,
  autoAdvanceInterval,
  currentIndex,
  totalPosts,
  hasMore,
  onToggleAutoAdvance,
  onChangeInterval,
  onNext,
  onPrevious,
}: StandardScrollControlsProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);

  const intervals = [
    { label: '3s', value: 3000 },
    { label: '5s', value: 5000 },
    { label: '10s', value: 10000 },
    { label: '30s', value: 30000 },
  ];

  return (
    <>
      {/* Top control bar */}
      <div className="absolute top-4 left-4 right-16 z-20 flex items-center gap-4">
        {/* Progress indicator */}
        <div className="flex-1 bg-gray-800/80 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-3">
          <div className="text-cyan-400 text-sm font-medium">
            {currentIndex + 1} / {totalPosts}
            {hasMore && '+'}
          </div>

          {/* Progress bar */}
          <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{
                width: `${((currentIndex + 1) / totalPosts) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Auto-advance toggle */}
        <button
          onClick={onToggleAutoAdvance}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            autoAdvance
              ? 'bg-cyan-500 text-black hover:bg-cyan-400'
              : 'bg-gray-800/80 text-white hover:bg-gray-700/80'
          } backdrop-blur-sm`}
          title={
            autoAdvance
              ? t('standardScrollControls.titles.pauseAutoAdvance')
              : t('standardScrollControls.titles.enableAutoAdvance')
          }
        >
          {autoAdvance ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="px-4 py-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700/80 backdrop-blur-sm transition-all"
          title={t('standardScrollControls.titles.settings')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-20 left-4 z-20 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-lg p-4 min-w-[250px]">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-cyan-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            {t('standardScrollControls.settingsPanel.title')}
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {intervals.map((interval) => (
              <button
                key={interval.value}
                onClick={() => onChangeInterval(interval.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  autoAdvanceInterval === interval.value
                    ? 'bg-cyan-500 text-black'
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                {interval.label}
              </button>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="text-gray-400 text-xs space-y-1">
              <p>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-cyan-400">↑↓</kbd>{' '}
                {t('standardScrollControls.help.navigate')}
              </p>
              <p>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-cyan-400">
                  {t('standardScrollControls.keys.space')}
                </kbd>{' '}
                {t('standardScrollControls.help.toggleAuto')}
              </p>
              <p>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-cyan-400">
                  {t('standardScrollControls.keys.escape')}
                </kbd>{' '}
                {t('standardScrollControls.help.exit')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation arrows */}
      <button
        onClick={onPrevious}
        disabled={currentIndex === 0}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 text-white hover:text-cyan-400 disabled:opacity-30 disabled:hover:text-white transition-colors p-2"
        aria-label={t('standardScrollControls.aria.previousPost')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-12 w-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      <button
        onClick={onNext}
        disabled={currentIndex >= totalPosts - 1 && !hasMore}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-white hover:text-cyan-400 disabled:opacity-30 disabled:hover:text-white transition-colors p-2"
        aria-label={t('standardScrollControls.aria.nextPost')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-12 w-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </>
  );
}
