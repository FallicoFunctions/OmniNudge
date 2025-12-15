import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState<number | null>(initialUserVote ?? null);
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
      voteMutation.mutate(-1);
    }
  };

  const sizeClasses = {
    small: 'text-sm gap-0.5',
    medium: 'text-base gap-0',
    large: 'text-lg gap-1.5',
  };

  const buttonSizeClasses = {
    small: 'p-0.5 text-base',
    medium: 'p-0 text-base',
    large: 'p-1.5 text-xl',
  };

  const scoreSizeClasses = {
    small: 'text-xs font-medium',
    medium: 'text-xs font-semibold',
    large: 'text-base font-bold',
  };

  if (layout === 'horizontal') {
    return (
      <div className={`flex items-center ${sizeClasses[size]}`}>
        <button
          onClick={handleUpvote}
          disabled={voteMutation.isPending}
          className={`
            rounded transition-colors ${buttonSizeClasses[size]}
            ${
              userVote === 1
                ? 'text-orange-500 hover:text-orange-600'
                : 'text-[var(--color-text-secondary)] hover:text-orange-500 hover:bg-[var(--color-surface-elevated)]'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          aria-label="Upvote"
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
            rounded transition-colors ${buttonSizeClasses[size]}
            ${
              userVote === -1
                ? 'text-blue-500 hover:text-blue-600'
                : 'text-[var(--color-text-secondary)] hover:text-blue-500 hover:bg-[var(--color-surface-elevated)]'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          aria-label="Downvote"
        >
          ▼
        </button>
      </div>
    );
  }

  // Vertical layout (default)
  return (
    <div className={`flex flex-col items-center ${sizeClasses[size]}`}>
      <button
        onClick={handleUpvote}
        disabled={voteMutation.isPending}
        className={`
          rounded transition-colors ${buttonSizeClasses[size]}
          ${
            userVote === 1
              ? 'text-orange-500 hover:text-orange-600'
              : 'text-[var(--color-text-secondary)] hover:text-orange-500 hover:bg-[var(--color-surface-elevated)]'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        aria-label="Upvote"
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
          rounded transition-colors ${buttonSizeClasses[size]}
          ${
            userVote === -1
              ? 'text-blue-500 hover:text-blue-600'
              : 'text-[var(--color-text-secondary)] hover:text-blue-500 hover:bg-[var(--color-surface-elevated)]'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        aria-label="Downvote"
      >
        ▼
      </button>
    </div>
  );
}
