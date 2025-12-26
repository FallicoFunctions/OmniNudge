import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useMessagingContext } from '../contexts/MessagingContext';
import ThemeSelector from '../components/themes/ThemeSelector';
import { usersService } from '../services/usersService';
import { messagesService } from '../services/messagesService';
import { useMessagingWebSocket } from '../hooks/useMessagingWebSocket';
import type { UserProfile } from '../types/users';
import AuthModal from '../pages/AuthModal';
import { subscriptionService } from '../services/subscriptionService';

export default function MainLayout() {
  const { user, logout } = useAuth();
  const [authModal, setAuthModal] = useState<'login' | 'signup' | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<{ to: string; state?: unknown } | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | null
    | {
        type: 'subscribeSubreddit';
        subreddit: string;
      }
  >(null);
  const { activeConversationId } = useMessagingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Initialize WebSocket connection for real-time messaging
  useMessagingWebSocket({ activeConversationId });

  const handleLogout = () => {
    logout();
    // User stays on current page after logout
  };

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesService.getConversations(),
    enabled: !!user,
  });

  const unreadTotal =
    conversations?.reduce((total, conv) => total + (conv.unread_count ?? 0), 0) ?? 0;

  useEffect(() => {
    if (!user) {
      return;
    }

    const ping = async () => {
      try {
        const lastSeen = await usersService.ping();
        if (lastSeen) {
          queryClient.setQueryData<UserProfile | undefined>(
            ['user-profile', user.username],
            (previous) =>
              previous
                ? {
                    ...previous,
                    last_seen: lastSeen,
                  }
                : previous
          );
        }
        queryClient.invalidateQueries({ queryKey: ['user-profile', user.username] });
      } catch (err) {
        console.error('Presence ping failed:', err);
      }
    };

    ping();
  }, [user, location.pathname, queryClient]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<
        { mode: 'login' | 'signup'; redirectTo?: string; redirectState?: unknown } | 'login' | 'signup'
      >;
      const detail = custom.detail;
      if (detail === 'login' || detail === 'signup') {
        setAuthModal(detail);
        setPendingRedirect(null);
        setPendingAction(null);
        return;
      }
      if (detail && typeof detail === 'object' && (detail.mode === 'login' || detail.mode === 'signup')) {
        setAuthModal(detail.mode);
        if (detail.redirectTo) {
          setPendingRedirect({ to: detail.redirectTo, state: detail.redirectState });
        } else {
          setPendingRedirect(null);
        }
        if (detail.action && detail.action.type === 'subscribeSubreddit') {
          setPendingAction({ type: 'subscribeSubreddit', subreddit: detail.action.subreddit });
        } else {
          setPendingAction(null);
        }
      }
    };
    window.addEventListener('open-auth-modal', handler as EventListener);
    return () => window.removeEventListener('open-auth-modal', handler as EventListener);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Navigation Bar */}
      <nav className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link to="/" className="text-xl font-bold text-[var(--color-primary)]">
                OmniNudge
              </Link>
              <div className="hidden space-x-4 md:flex">
                <button
                  type="button"
                  onClick={() => {
                    if (user) {
                      navigate('/posts/create');
                    } else {
                      setPendingRedirect({ to: '/posts/create' });
                      setAuthModal('login');
                    }
                  }}
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Create Post
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (user) {
                      navigate('/messages');
                    } else {
                      setPendingRedirect({ to: '/messages' });
                      setAuthModal('login');
                    }
                  }}
                  className="relative rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Messages
                  {unreadTotal > 0 && (
                    <span className="absolute -right-2 -top-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white">
                      {unreadTotal}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (user) {
                      navigate('/hubs/create');
                    } else {
                      setPendingRedirect({ to: '/hubs/create' });
                      setAuthModal('login');
                    }
                  }}
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Create Hub
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/hubs')}
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Browse Hubs
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <ThemeSelector variant="toolbar" />
              {user ? (
                <>
                  <Link
                    to={`/users/${user.username}`}
                    className="text-sm font-medium text-[var(--color-text-primary)]"
                  >
                    {user.username}
                  </Link>
                  <Link
                    to="/settings"
                    className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                  >
                    Settings
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAuthModal('login')}
                    className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthModal('signup')}
                    className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>

      {authModal && (
        <AuthModal
          mode={authModal}
          onClose={() => setAuthModal(null)}
          onSwitch={(mode) => setAuthModal(mode)}
          onSuccess={async () => {
            setAuthModal(null);
            if (pendingAction?.type === 'subscribeSubreddit') {
              try {
                await subscriptionService.subscribeToSubreddit(pendingAction.subreddit);
                queryClient.invalidateQueries({ queryKey: ['subreddit-subscription', pendingAction.subreddit] });
                queryClient.invalidateQueries({ queryKey: ['user-subscriptions'] });
                queryClient.invalidateQueries({ queryKey: ['user-subscriptions', 'subreddits'] });
              } catch (err) {
                console.error('Auto-subscribe failed', err);
              }
              setPendingAction(null);
            }
            if (pendingRedirect) {
              navigate(pendingRedirect.to, { state: pendingRedirect.state, replace: true });
              setPendingRedirect(null);
            }
          }}
        />
      )}
    </div>
  );
}
