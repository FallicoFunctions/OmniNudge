
/**
 * Reusable loading state components for consistent UX across the app
 * Includes: Skeleton screens, spinners, and progress bars
 */

// Skeleton - For content placeholders
interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string;
  height?: string;
  lines?: number; // For text variant - number of lines to show
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  lines = 1,
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-[var(--color-surface-elevated)]';

  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  const style = {
    width: width || (variant === 'circular' ? '40px' : '100%'),
    height: height || (variant === 'text' ? '1rem' : variant === 'circular' ? '40px' : '200px'),
  };

  // For text variant with multiple lines
  if (variant === 'text' && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClasses} ${variantClasses.text}`}
            style={{
              width: i === lines - 1 ? '80%' : '100%', // Last line is shorter
              height: style.height,
            }}
          />
        ))}
      </div>
    );
  }

  return <div className={`${baseClasses} ${variantClasses[variant]} ${className}`} style={style} />;
}

// PostCardSkeleton - Skeleton for post cards
export function PostCardSkeleton() {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex gap-3">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-2 w-10">
          <Skeleton variant="rectangular" width="24px" height="24px" />
          <Skeleton variant="text" width="20px" height="16px" />
          <Skeleton variant="rectangular" width="24px" height="24px" />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-3">
          {/* Metadata */}
          <div className="flex items-center gap-2">
            <Skeleton variant="circular" width="20px" height="20px" />
            <Skeleton variant="text" width="100px" height="12px" />
            <Skeleton variant="text" width="60px" height="12px" />
            <Skeleton variant="text" width="80px" height="12px" />
          </div>

          {/* Title */}
          <Skeleton variant="text" width="90%" height="20px" />

          {/* Thumbnail/Preview */}
          <Skeleton variant="rectangular" width="100%" height="200px" />

          {/* Action buttons */}
          <div className="flex gap-3">
            <Skeleton variant="text" width="80px" height="14px" />
            <Skeleton variant="text" width="60px" height="14px" />
            <Skeleton variant="text" width="60px" height="14px" />
          </div>
        </div>
      </div>
    </div>
  );
}

// CommentSkeleton - Skeleton for comment threads
interface CommentSkeletonProps {
  depth?: number;
  showReplies?: boolean;
}

export function CommentSkeleton({ depth = 0, showReplies = false }: CommentSkeletonProps) {
  return (
    <div className={depth > 0 ? 'ml-6 mt-3 border-l-[3px] border-[var(--color-border)] pl-5' : ''}>
      <div className="flex gap-2">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-1 w-8">
          <Skeleton variant="rectangular" width="16px" height="16px" />
          <Skeleton variant="text" width="16px" height="12px" />
          <Skeleton variant="rectangular" width="16px" height="16px" />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-2">
          {/* Metadata */}
          <div className="flex items-center gap-2">
            <Skeleton variant="text" width="80px" height="12px" />
            <Skeleton variant="text" width="40px" height="12px" />
            <Skeleton variant="text" width="60px" height="12px" />
          </div>

          {/* Comment text */}
          <Skeleton variant="text" lines={3} />

          {/* Action buttons */}
          <div className="flex gap-2">
            <Skeleton variant="text" width="60px" height="12px" />
            <Skeleton variant="text" width="40px" height="12px" />
            <Skeleton variant="text" width="40px" height="12px" />
          </div>
        </div>
      </div>

      {/* Nested replies */}
      {showReplies && depth < 2 && (
        <div className="space-y-3 mt-3">
          <CommentSkeleton depth={depth + 1} showReplies={false} />
        </div>
      )}
    </div>
  );
}
