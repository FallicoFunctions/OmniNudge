import { useTranslation } from 'react-i18next';

interface ProgressBarProps {
  value?: number; // 0-100 for determinate, undefined for indeterminate
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  small: 'h-1',
  medium: 'h-2',
  large: 'h-3',
};

export function ProgressBar({
  value,
  size = 'medium',
  showLabel = false,
  className = '',
}: ProgressBarProps) {
  const { t } = useTranslation();
  const isDeterminate = value !== undefined;
  const percentage = isDeterminate ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div className={className}>
      {showLabel && isDeterminate && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-secondary">{t('common.progress')}</span>
          <span className="text-sm font-semibold">{percentage}%</span>
        </div>
      )}

      <div
        className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${sizeClasses[size]}`}
      >
        {isDeterminate ? (
          // Determinate progress bar
          <div
            className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        ) : (
          // Indeterminate progress bar (animated)
          <div
            className="h-full bg-primary animate-progress rounded-full"
            role="progressbar"
            aria-label={t('common.accessibility.loading')}
          />
        )}
      </div>
    </div>
  );
}

// Circular progress indicator
export function CircularProgress({
  value,
  size = 48,
  strokeWidth = 4,
  showLabel = false,
  className = '',
}: {
  value?: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const isDeterminate = value !== undefined;
  const percentage = isDeterminate ? Math.min(100, Math.max(0, value)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = isDeterminate
    ? circumference - (percentage / 100) * circumference
    : circumference * 0.25;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className={isDeterminate ? '' : 'animate-spin'}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-300"
        />
      </svg>
      {showLabel && isDeterminate && (
        <span className="absolute text-sm font-semibold">{percentage}%</span>
      )}
    </div>
  );
}

// Progress animation styles for indeterminate progress
export const progressAnimationStyles = `
@keyframes progress {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

.animate-progress {
  animation: progress 1.5s ease-in-out infinite;
  width: 25%;
}
`;
