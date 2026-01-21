import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useMessagingContext } from '../contexts/MessagingContext';
import { useMultiColumnFeed } from '../contexts/MultiColumnFeedContext';
import { usersService } from '../services/usersService';
import { messagesService } from '../services/messagesService';
import { useMessagingWebSocket } from '../hooks/useMessagingWebSocket';
import type { UserProfile } from '../types/users';
import AuthModal from '../pages/AuthModal';
import BugReportModal from '../components/bugReports/BugReportModal';
import { subscriptionService } from '../services/subscriptionService';
import { LoadingMessage } from '../components/common/StatusMessage';
import { ViewModeToggle } from '../components/feed/ViewModeToggle';

const AboutContent = lazy(() =>
  import('../components/about/AboutContent').then((module) => ({
    default: module.AboutContent,
  }))
);

const prefetchRoutes = {
  about: () => import('../pages/AboutPage'),
  bugReporting: () => import('../pages/BugReportingPage'),
  createHub: () => import('../pages/CreateHubPage'),
  createPost: () => import('../pages/CreatePostPage'),
  hubs: () => import('../pages/HubsAndSubsPage'),
  messages: () => import('../pages/MessagesPage'),
  settings: () => import('../pages/SettingsPage'),
  themes: () => import('../pages/ThemesPage'),
  admin: () => import('../pages/AdminPage'),
  profile: () => import('../pages/UserProfilePage'),
};

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { notifyArchivedMessages } = useSettings();
  const { state: multiColumnState } = useMultiColumnFeed();
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
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const aboutModalStorageKey = 'omninudge_about_modal_dismissed';
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [bugReportUrl, setBugReportUrl] = useState('');
  const [openBugReportAfterAuth, setOpenBugReportAfterAuth] = useState(false);

  // Determine if slim mode
  const isSlimMode = multiColumnState.viewMode === 'multi-column' || multiColumnState.viewMode === 'vertical-omniscroll';
  const navHeight = isSlimMode ? 'h-9' : 'h-16';

  // Initialize WebSocket connection for real-time messaging
  useMessagingWebSocket({ activeConversationId });

  const handleLogout = () => {
    logout();
    // User stays on current page after logout
  };

  const { data: conversations } = useQuery({
    queryKey: ['conversations', notifyArchivedMessages ? 'with-archived' : 'active'],
    queryFn: () => messagesService.getConversations(notifyArchivedMessages),
    enabled: !!user,
  });

  const unreadTotal = useMemo(
    () =>
      conversations?.reduce((total, conv) => {
        if (!notifyArchivedMessages && conv.archived_at) {
          return total;
        }
        return total + (conv.unread_count ?? 0);
      }, 0) ?? 0,
    [conversations, notifyArchivedMessages]
  );

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
        | { mode: 'login' | 'signup'; redirectTo?: string; redirectState?: unknown; action?: { type: 'subscribeSubreddit'; subreddit: string } }
        | 'login'
        | 'signup'
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem(aboutModalStorageKey) === 'true';
    if (!dismissed) {
      setShowAboutModal(true);
    }
  }, [aboutModalStorageKey]);

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Navigation Bar */}
      <nav
        className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200"
        style={{ height: isSlimMode ? '36px' : '64px' }}
      >
        <div className="mx-auto max-w-7xl px-4 h-full">
          <div className={`flex ${navHeight} items-center justify-between h-full`}>
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className={`font-bold text-[var(--color-primary)] transition-all duration-200 ${isSlimMode ? 'text-base' : 'text-xl'}`}
              >
                {isSlimMode ? 'ON' : 'OmniNudge'}
              </Link>
              {!isSlimMode && (
                <div className="hidden space-x-4 md:flex">
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
                  onMouseEnter={() => prefetchRoutes.messages()}
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
                  onClick={() => navigate('/hubs')}
                  onMouseEnter={() => prefetchRoutes.hubs()}
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Browse Hubs
                </button>
                </div>
              )}

              {/* View Mode Toggle - always visible */}
              <ViewModeToggle />

              {!isSlimMode && (
                <Link
                  to="/about"
                  onMouseEnter={() => prefetchRoutes.about()}
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  About
                </Link>
              )}
            </div>

            <div className={`flex items-center ${isSlimMode ? 'gap-2' : 'gap-4'}`}>
              {user ? (
                <>
                  {!isSlimMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setBugReportUrl(window.location.href);
                          setShowBugReportModal(true);
                        }}
                        onMouseEnter={() => prefetchRoutes.bugReporting()}
                        className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                      >
                        Bug Reporting
                      </button>
                      <Link
                        to={`/users/${user.username}`}
                        onMouseEnter={() => prefetchRoutes.profile()}
                        className="text-sm font-medium text-[var(--color-text-primary)]"
                      >
                        {user.username}
                      </Link>
                    </>
                  )}
                  <Link
                    to="/settings"
                    onMouseEnter={() => prefetchRoutes.settings()}
                    className={`rounded-md bg-[var(--color-surface-elevated)] ${isSlimMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'} font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)]`}
                  >
                    {isSlimMode ? '⚙' : 'Settings'}
                  </Link>
                  {!isSlimMode && user.role === 'admin' && (
                    <Link
                      to="/admin"
                      onMouseEnter={() => prefetchRoutes.admin()}
                      className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Admin
                    </Link>
                  )}
                  {!isSlimMode && (
                    <button
                      onClick={handleLogout}
                      className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                    >
                      Logout
                    </button>
                  )}
                </>
              ) : (
                <>
                  {!isSlimMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setBugReportUrl(window.location.href);
                        setOpenBugReportAfterAuth(true);
                        setAuthModal('login');
                      }}
                      onMouseEnter={() => prefetchRoutes.bugReporting()}
                      className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                    >
                      Bug Reporting
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAuthModal('login')}
                    className={`rounded-md ${isSlimMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'} font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]`}
                  >
                    Login
                  </button>
                  {!isSlimMode && (
                    <button
                      type="button"
                      onClick={() => setAuthModal('signup')}
                      className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                      Sign Up
                    </button>
                  )}
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

      {showAboutModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-4xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <div className="max-h-[70vh] overflow-y-auto pr-2">
              <Suspense
                fallback={
                  <div className="py-6">
                    <LoadingMessage>Loading...</LoadingMessage>
                  </div>
                }
              >
                <AboutContent />
              </Suspense>
            </div>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(event) => setDontShowAgain(event.target.checked)}
                  className="h-4 w-4"
                />
                Don&apos;t Show This Again
              </label>
              <button
                type="button"
                onClick={() => {
                  if (dontShowAgain) {
                    localStorage.setItem(aboutModalStorageKey, 'true');
                  }
                  setShowAboutModal(false);
                }}
                className="rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <BugReportModal
        isOpen={showBugReportModal}
        onClose={() => setShowBugReportModal(false)}
        initialUrl={bugReportUrl}
        onNavigateToPage={() => {
          setShowBugReportModal(false);
          navigate('/bug-reporting');
        }}
      />

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
            if (openBugReportAfterAuth) {
              setOpenBugReportAfterAuth(false);
              setShowBugReportModal(true);
            }
          }}
        />
      )}
    </div>
  );
}
