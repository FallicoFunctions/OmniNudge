import type { ReactNode } from 'react';
import type { User } from '../../types/auth';

interface AuthRedirect {
  redirectTo: string;
  redirectState?: unknown;
  action?: { type: string; [key: string]: unknown };
}

interface CreateActionButtonsProps {
  user: User | null;
  onCreatePost: () => void;
  onCreateHub: () => void;
  postAuth: AuthRedirect;
  hubAuth: AuthRedirect;
  showCreateHub?: boolean;
  className?: string;
  extraButtons?: ReactNode;
}

export function CreateActionButtons({
  user,
  onCreatePost,
  onCreateHub,
  postAuth,
  hubAuth,
  showCreateHub = true,
  className = '',
  extraButtons,
}: CreateActionButtonsProps) {
  const openAuthModal = (auth: AuthRedirect) => {
    window.dispatchEvent(
      new CustomEvent('open-auth-modal', {
        detail: {
          mode: 'login',
          redirectTo: auth.redirectTo,
          redirectState: auth.redirectState,
          action: auth.action,
        },
      })
    );
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 lg:flex-nowrap ${className}`}>
      {extraButtons}
      <button
        type="button"
        onClick={() => {
          if (!user) {
            openAuthModal(postAuth);
            return;
          }
          onCreatePost();
        }}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Create Post
      </button>
      {showCreateHub && (
        <button
          type="button"
          onClick={() => {
            if (!user) {
              openAuthModal(hubAuth);
              return;
            }
            onCreateHub();
          }}
          className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Create Hub
        </button>
      )}
    </div>
  );
}
