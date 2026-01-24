import { useState, useCallback } from 'react';

interface AsyncActionState {
  isLoading: boolean;
  error: string | null;
}

interface UseAsyncActionReturn<T extends unknown[]> {
  isLoading: boolean;
  error: string | null;
  execute: (...args: T) => Promise<void>;
  reset: () => void;
}

/**
 * Hook to manage async action state (loading, error)
 * Eliminates need for separate useState calls for loading and error
 *
 * @example
 * const { isLoading, error, execute } = useAsyncAction(async (postId: number) => {
 *   await deletePost(postId);
 *   onSuccess();
 * });
 */
export function useAsyncAction<T extends unknown[]>(
  action: (...args: T) => Promise<void>,
  onError?: (error: Error) => void
): UseAsyncActionReturn<T> {
  const [state, setState] = useState<AsyncActionState>({
    isLoading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: T) => {
      setState({ isLoading: true, error: null });
      try {
        await action(...args);
        setState({ isLoading: false, error: null });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setState({ isLoading: false, error: errorMessage });
        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
      }
    },
    [action, onError]
  );

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null });
  }, []);

  return {
    isLoading: state.isLoading,
    error: state.error,
    execute,
    reset,
  };
}

interface PendingStates {
  [key: string]: boolean;
}

interface UseMultipleActionsReturn {
  pending: PendingStates;
  setPending: (key: string, value: boolean) => void;
  isPending: (key: string) => boolean;
  resetAll: () => void;
}

/**
 * Hook to manage multiple concurrent action states
 * Eliminates need for separate useState calls for each pending action
 *
 * @example
 * const { pending, setPending, isPending } = useMultipleActions();
 *
 * const handleVote = async () => {
 *   setPending('vote', true);
 *   await voteOnPost();
 *   setPending('vote', false);
 * };
 *
 * <button disabled={isPending('vote')}>Vote</button>
 */
export function useMultipleActions(): UseMultipleActionsReturn {
  const [pending, setPendingState] = useState<PendingStates>({});

  const setPending = useCallback((key: string, value: boolean) => {
    setPendingState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isPending = useCallback(
    (key: string) => {
      return pending[key] === true;
    },
    [pending]
  );

  const resetAll = useCallback(() => {
    setPendingState({});
  }, []);

  return {
    pending,
    setPending,
    isPending,
    resetAll,
  };
}
