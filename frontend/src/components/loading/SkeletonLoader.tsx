import { ShimmerEffect } from './ShimmerEffect';

interface SkeletonProps {
  className?: string;
}

// Base skeleton with shimmer animation
function Skeleton({ className = '' }: SkeletonProps) {
  return <ShimmerEffect className={className} />;
}

// Text line skeleton
export function SkeletonText({
  lines = 1,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
      ))}
    </div>
  );
}

// Image skeleton
export function SkeletonImage({
  aspectRatio = 'square',
  className = '',
}: {
  aspectRatio?: 'square' | 'video' | 'wide';
  className?: string;
}) {
  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    wide: 'aspect-[21/9]',
  };

  return <Skeleton className={`w-full ${aspectClasses[aspectRatio]} ${className}`} />;
}

// Card skeleton (common pattern)
export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={`border border-border rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* Content */}
      <SkeletonText lines={3} className="mb-4" />

      {/* Footer */}
      <div className="flex gap-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

// Post card skeleton
export function SkeletonPost({ className = '' }: SkeletonProps) {
  return (
    <div className={`border border-border rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-3 w-32 mb-1" />
          <Skeleton className="h-2 w-20" />
        </div>
      </div>

      {/* Title */}
      <Skeleton className="h-5 w-full mb-2" />
      <Skeleton className="h-5 w-3/4 mb-3" />

      {/* Content */}
      <SkeletonText lines={2} className="mb-3" />

      {/* Image placeholder */}
      <SkeletonImage aspectRatio="video" className="mb-3" />

      {/* Footer */}
      <div className="flex gap-6">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  );
}

// List skeleton
export function SkeletonList({
  items = 5,
  className = '',
}: {
  items?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 border border-border rounded">
          <Skeleton className="w-12 h-12 rounded" />
          <div className="flex-1">
            <Skeleton className="h-4 w-48 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="w-16 h-8 rounded" />
        </div>
      ))}
    </div>
  );
}

// Message bubble skeleton
export function SkeletonMessage({
  isOwn = false,
  className = '',
}: {
  isOwn?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${className}`}>
      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <Skeleton className="h-4 w-20 mb-1" />
        <Skeleton className={`h-12 ${isOwn ? 'w-48' : 'w-56'} rounded-2xl`} />
      </div>
    </div>
  );
}

// Add shimmer animation to global styles
// This would go in index.css or a global stylesheet
export const shimmerStyles = `
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
`;
