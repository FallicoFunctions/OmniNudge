import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { postsService } from '../services/postsService';

interface VoteButtonsProps {
  postId: number;
  initialScore: number;
  initialUserVote?: number | null;
  layout?: 'vertical' | 'horizontal';
  size?: 'small' | 'medium' | 'large';
}

export function VoteButtons({
  postId,
  initialScore,
  initialUserVote = null,
  layout = 'vertical',
  size = 'medium',
}: VoteButtonsProps) {
  const { t } = useTranslation();
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState<number | null>(initialUserVote ?? null);
  const [floatingText, setFloatingText] = useState<{
    value: string;
    key: number;
  } | null>(null);
  const queryClient = useQueryClient();

  const voteMutation = useMutation({
    mutationFn: (value: 1 | -1 | 0) => postsService.votePost(postId, value),
    onMutate: async (newVote) => {
      // Optimistic update
      const previousVote = userVote;
      const scoreDelta = calculateScoreDelta(previousVote, newVote);

      setScore((prev) => prev + scoreDelta);
      setUserVote(newVote === 0 ? null : newVote);

      return { previousVote, previousScore: score };
    },
    onError: (err, _newVote, context) => {
      // Revert on error
      if (context) {
        setScore(context.previousScore);
        setUserVote(context.previousVote);
      }
      console.error('Failed to vote:', err);
    },
    onSuccess: () => {
      // Invalidate queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['hubs'] });
      queryClient.invalidateQueries({ queryKey: ['reddit'] });
    },
  });

  const calculateScoreDelta = (oldVote: number | null, newVote: number): number => {
    const old = oldVote ?? 0;
    return newVote - old;
  };

  const handleUpvote = () => {
    if (voteMutation.isPending) return;

    if (userVote === 1) {
      // Remove upvote
      voteMutation.mutate(0);
    } else {
      // Add upvote (or toggle from downvote)
      // MISC-9: Show floating feedback animation
      setFloatingText({ value: '+1', key: Date.now() });
      setTimeout(() => setFloatingText(null), 1000);
      voteMutation.mutate(1);
    }
  };

  const handleDownvote = () => {
    if (voteMutation.isPending) return;

    if (userVote === -1) {
      // Remove downvote
      voteMutation.mutate(0);
    } else {
      // Add downvote (or toggle from upvote)
      // MISC-9: Show floating feedback animation
      setFloatingText({ value: '-1', key: Date.now() });
      setTimeout(() => setFloatingText(null), 1000);
      voteMutation.mutate(-1);
    }
  };

  const sizeClasses = {
    small: 'text-sm gap-0.5',
    medium: 'text-base gap-1',
    large: 'text-lg gap-1.5',
  };

  const buttonSizeClasses = {
    small: 'p-1 text-base min-w-[32px] min-h-[32px]',
    medium: 'p-2 text-base min-w-[40px] min-h-[40px]',
    large: 'p-2 text-xl min-w-[48px] min-h-[48px]',
  };

  const scoreSizeClasses = {
    small: 'text-sm font-semibold',
    medium: 'text-base font-bold',
    large: 'text-lg font-bold',
  };

  if (layout === 'horizontal') {
    return (
      <div className={`relative flex items-center ${sizeClasses[size]}`}>
        {/* MISC-9: Floating vote feedback */}
        {floatingText && (
          <div
            key={floatingText.key}
            className={`absolute -top-8 left-1/2 -translate-x-1/2 font-bold animate-float-up pointer-events-none ${
              floatingText.value === '+1' ? 'text-orange-500' : 'text-blue-500'
            }`}
          >
            {floatingText.value}
          </div>
        )}
        <button
          onClick={handleUpvote}
          disabled={voteMutation.isPending}
          className={`
            rounded transition-all duration-150 ${buttonSizeClasses[size]}
            ${
              userVote === 1
                ? 'text-orange-500 hover:text-orange-600 scale-110'
                : 'text-[var(--color-text-secondary)] hover:text-orange-500 hover:bg-[var(--color-surface-elevated)] hover:scale-105'
            }
            active:scale-95
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          aria-label={t('posts.actions.upvote')}
        >
          ▲
        </button>
        <span
          className={`
            ${scoreSizeClasses[size]} text-[var(--color-text-primary)] min-w-[2ch] text-center
          `}
        >
          {score}
        </span>
        <button
          onClick={handleDownvote}
          disabled={voteMutation.isPending}
          className={`
            rounded transition-all duration-150 ${buttonSizeClasses[size]}
            ${
              userVote === -1
                ? 'text-blue-500 hover:text-blue-600 scale-110'
                : 'text-[var(--color-text-secondary)] hover:text-blue-500 hover:bg-[var(--color-surface-elevated)] hover:scale-105'
            }
            active:scale-95
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          aria-label={t('posts.actions.downvote')}
        >
          ▼
        </button>
      </div>
    );
  }

  // Vertical layout (default)
  return (
    <div className={`relative flex flex-col items-center ${sizeClasses[size]}`}>
      {/* MISC-9: Floating vote feedback */}
      {floatingText && (
        <div
          key={floatingText.key}
          className={`absolute -top-6 left-1/2 -translate-x-1/2 font-bold animate-float-up pointer-events-none ${
            floatingText.value === '+1' ? 'text-orange-500' : 'text-blue-500'
          }`}
        >
          {floatingText.value}
        </div>
      )}
      <button
        onClick={handleUpvote}
        disabled={voteMutation.isPending}
        className={`
          rounded transition-all duration-150 ${buttonSizeClasses[size]}
          ${
            userVote === 1
              ? 'text-orange-500 hover:text-orange-600 scale-110'
              : 'text-[var(--color-text-secondary)] hover:text-orange-500 hover:bg-[var(--color-surface-elevated)] hover:scale-105'
          }
          active:scale-95
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        aria-label={t('posts.actions.upvote')}
      >
        ▲
      </button>
      <span
        className={`
          ${scoreSizeClasses[size]} text-[var(--color-text-primary)]
        `}
      >
        {score}
      </span>
      <button
        onClick={handleDownvote}
        disabled={voteMutation.isPending}
        className={`
          rounded transition-all duration-150 ${buttonSizeClasses[size]}
          ${
            userVote === -1
              ? 'text-blue-500 hover:text-blue-600 scale-110'
              : 'text-[var(--color-text-secondary)] hover:text-blue-500 hover:bg-[var(--color-surface-elevated)] hover:scale-105'
          }
          active:scale-95
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        aria-label={t('posts.actions.downvote')}
      >
        ▼
      </button>
    </div>
  );
}
