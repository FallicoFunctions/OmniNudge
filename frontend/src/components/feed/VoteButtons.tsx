import { useTranslation } from 'react-i18next';

interface VoteButtonsProps {
  score: number;
  userVote?: number | null;
  onVote: (vote: number) => void;
  size?: 'sm' | 'xs';
  orientation?: 'vertical' | 'horizontal';
}

export function VoteButtons({
  score,
  userVote = null,
  onVote,
  size = 'xs',
  orientation = 'vertical',
}: VoteButtonsProps) {
  const { t } = useTranslation();
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-3 w-3';
  const textSize = size === 'sm' ? 'text-xs' : 'text-[10px]';

  const handleUpvote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onVote(userVote === 1 ? 0 : 1);
  };

  const handleDownvote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onVote(userVote === -1 ? 0 : -1);
  };

  const scoreColor =
    score > 0 ? 'text-cyan-500' : score < 0 ? 'text-red-500' : 'text-[var(--color-text-muted)]';
  const upvoteColor =
    userVote === 1 ? 'text-cyan-500' : 'text-[var(--color-text-muted)] hover:text-cyan-500';
  const downvoteColor =
    userVote === -1 ? 'text-red-500' : 'text-[var(--color-text-muted)] hover:text-red-500';

  if (orientation === 'horizontal') {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleUpvote}
          className={`${upvoteColor} transition-colors`}
          aria-label={t('posts.actions.upvote')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
        <span className={`${textSize} ${scoreColor} font-semibold min-w-[24px] text-center`}>
          {score}
        </span>
        <button
          onClick={handleDownvote}
          className={`${downvoteColor} transition-colors`}
          aria-label={t('posts.actions.downvote')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={handleUpvote}
        className={`${upvoteColor} transition-colors`}
        aria-label={t('posts.actions.upvote')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
      <span className={`${textSize} ${scoreColor} font-semibold`}>{score}</span>
      <button
        onClick={handleDownvote}
        className={`${downvoteColor} transition-colors`}
        aria-label={t('posts.actions.downvote')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}
