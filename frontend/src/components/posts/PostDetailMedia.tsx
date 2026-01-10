type PostDetailMediaProps = {
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  decodedTitle: string;
  isVideoMedia: boolean;
  imageExpanded: boolean;
  onToggleExpanded: () => void;
};

export function PostDetailMedia({
  mediaUrl,
  thumbnailUrl,
  decodedTitle,
  isVideoMedia,
  imageExpanded,
  onToggleExpanded,
}: PostDetailMediaProps) {
  if (!mediaUrl && !thumbnailUrl) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col items-start gap-2">
      <div
        className="w-full cursor-pointer overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200"
        onClick={onToggleExpanded}
        title={imageExpanded ? 'Click to shrink' : 'Click to enlarge'}
      >
        {mediaUrl ? (
          isVideoMedia ? (
            <video
              controls
              className={`w-full object-contain ${imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px]'}`}
              src={mediaUrl}
              preload="metadata"
            />
          ) : (
            <img
              src={mediaUrl}
              alt={decodedTitle}
              loading="lazy"
              decoding="async"
              className={`w-full object-contain transition-transform duration-200 ${
                imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px] hover:scale-[1.03]'
              }`}
            />
          )
        ) : (
          <img
            src={thumbnailUrl ?? ''}
            alt={decodedTitle}
            loading="lazy"
            decoding="async"
            className={`w-full object-contain transition-transform duration-200 ${
              imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px] hover:scale-[1.03]'
            }`}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onToggleExpanded}
        className="text-xs text-[var(--color-primary)] hover:underline"
      >
        {imageExpanded ? 'View smaller' : 'View full size'}
      </button>
    </div>
  );
}
