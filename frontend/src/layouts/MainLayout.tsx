import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useMultiColumnFeed } from '../contexts/MultiColumnFeedContext';
import { useMessagingContext } from '../contexts/MessagingContext';
import { usersService } from '../services/usersService';
import { messagesService } from '../services/messagesService';
import type { UserProfile } from '../types/users';
import AuthModal from '../pages/AuthModal';
import BugReportModal from '../components/bugReports/BugReportModal';
import { subscriptionService } from '../services/subscriptionService';
import { LoadingMessage } from '../components/common/StatusMessage';
import { ViewModeToggle } from '../components/feed/ViewModeToggle';
import { HamburgerMenu } from '../components/navigation/HamburgerMenu';
import { AccountMenu } from '../components/navigation/AccountMenu';
import { ConnectionStatusIndicator } from '../components/common/ConnectionStatusIndicator';
import { useNotificationSound } from '../hooks/useNotificationSound';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MobileTabBar } from '../components/mobile/MobileTabBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastContainer } from '../components/error';
import { dismissToast, useToasts } from '../hooks/useToast';
import { UpgradeModal } from '../components/payments/UpgradeModal';

const AboutContent = lazy(() =>
  import('../components/about/AboutContent').then((module) => ({
    default: module.AboutContent,
  }))
);

const prefetchRoutes = {
  about: () => import('../pages/AboutPage'),
  createHub: () => import('../pages/CreateHubPage'),
  createPost: () => import('../pages/CreatePostPage'),
  hubs: () => import('../pages/HubsAndSubsPage'),
  messages: () => import('../pages/MessagesPage'),
  settings: () => import('../pages/SettingsPage'),
  themes: () => import('../pages/ThemesPage'),
  admin: () => import('../pages/AdminPage'),
  moderationReports: () => import('../pages/ModerationReportsPage'),
  profile: () => import('../pages/UserProfilePage'),
};

export default function MainLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { notifyArchivedMessages } = useSettings();
  const { state: multiColumnState } = useMultiColumnFeed();
  const { activeConversationId } = useMessagingContext();
  const [authModal, setAuthModal] = useState<'login' | 'signup' | 'forgot-password' | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<{ to: string; state?: unknown } | null>(
    null
  );
  const [pendingAction, setPendingAction] = useState<null | {
    type: 'subscribeSubreddit';
    subreddit: string;
  }>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const aboutModalStorageKey = 'omninudge_about_modal_dismissed';
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [bugReportUrl, setBugReportUrl] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const toasts = useToasts();

  // Enable notification sounds globally
  useNotificationSound();

  const isAIPreview = /^\/h\/[^/]+\/ai-design\/preview\//.test(location.pathname);

  // Determine if slim mode
  const isSlimMode =
    multiColumnState.viewMode === 'omniscroll' || multiColumnState.viewMode === 'standard-scroll';
  const navHeight = isSlimMode ? 'h-9' : 'h-16';

  // Mobile detection - 767px = Tailwind md: breakpoint (768px) - 1
  const isMobile = useMediaQuery('(max-width: 767px)');

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
        // Don't count unread messages for the conversation the user currently has open
        if (activeConversationId !== null && conv.id === activeConversationId) {
          return total;
        }
        return total + (conv.unread_count ?? 0);
      }, 0) ?? 0,
    [conversations, notifyArchivedMessages, activeConversationId]
  );

  // Reset iOS Safari scroll state on every route change.
  // When navigating away from a fixed-height overflow-hidden page (e.g. MessagesPage),
  // iOS does not re-evaluate the body's scrollability in an SPA. scrollTo(0,0)
  // forces a re-evaluation so the next page scrolls normally.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

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
        | {
            mode: 'login' | 'signup';
            redirectTo?: string;
            redirectState?: unknown;
            action?: { type: 'subscribeSubreddit'; subreddit: string };
          }
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
      if (
        detail &&
        typeof detail === 'object' &&
        (detail.mode === 'login' || detail.mode === 'signup')
      ) {
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
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
      >
        {t('mainLayout.skipToMainContent')}
      </a>

      {/* Navigation Bar */}
      <nav
        className={`sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200${isAIPreview ? ' hidden' : ''}`}
        style={{ height: isSlimMode ? '36px' : '64px' }}
      >
        <div className="mx-auto max-w-7xl px-4 h-full">
          <div className={`flex ${navHeight} items-center justify-between h-full`}>
            <div className="flex items-center gap-6">
              {/* Logo */}
              <Link
                to="/"
                className={`font-bold text-[var(--color-primary)] transition-all duration-200 ${isSlimMode ? 'text-base' : 'text-xl'}`}
              >
                {isSlimMode ? t('common.brandNameShort') : t('common.brandName')}
              </Link>

              {!isSlimMode && (
                <>
                  {/* Navigation Group: Primary Links */}
                  <div className="hidden md:flex items-center gap-4">
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
                      {t('nav.messages')}
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
                      {t('menu.hubs')}
                    </button>
                    <Link
                      to="/about"
                      onMouseEnter={() => prefetchRoutes.about()}
                      className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                    >
                      {t('menu.about')}
                    </Link>
                    <Link
                      to="/donate"
                      className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                    >
                      Donate
                    </Link>
                  </div>

                  {/* Divider */}
                  <div className="hidden md:block h-6 w-px bg-[var(--color-border)]" />
                </>
              )}

              {/* View Mode Toggle - hidden on mobile */}
              <div className="hidden md:block">
                <ViewModeToggle />
              </div>
            </div>

            <div className={`hidden md:flex items-center ${isSlimMode ? 'gap-2' : 'gap-4'}`}>
              {user ? (
                <>
                  {!isSlimMode && (
                    <AccountMenu
                      username={user.username}
                      isAdmin={user.role === 'admin'}
                      isModerator={user.role === 'admin' || user.role === 'moderator'}
                      onLogout={handleLogout}
                      onBugReport={() => {
                        setBugReportUrl(window.location.href);
                        setShowBugReportModal(true);
                      }}
                      plan={user.plan ?? 'free'}
                      planExpiresAt={user.plan_expires_at}
                      onUpgrade={() => setShowUpgradeModal(true)}
                    />
                  )}

                  {/* Slim mode: hamburger menu */}
                  {isSlimMode && (
                    <HamburgerMenu
                      items={[
                        {
                          label: t('nav.messages'),
                          to: '/messages',
                          badge: unreadTotal,
                        },
                        {
                          label: t('menu.hubs'),
                          to: '/hubs',
                        },
                        {
                          label: t('menu.about'),
                          to: '/about',
                        },
                        {
                          label: 'Donate',
                          to: '/donate',
                        },
                        ...(!user.plan || user.plan === 'free'
                          ? [
                              {
                                label: 'Upgrade to Paid',
                                onClick: () => setShowUpgradeModal(true),
                                className: 'text-[var(--color-primary)] font-semibold',
                              },
                            ]
                          : []),
                        {
                          label: t('mainLayout.bugReporting'),
                          onClick: () => {
                            setBugReportUrl(window.location.href);
                            setShowBugReportModal(true);
                          },
                        },
                        {
                          label: user.username,
                          to: `/users/${user.username}`,
                          icon: (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                          ),
                        },
                        {
                          label: t('common.settings'),
                          to: '/settings',
                          icon: (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                          ),
                        },
                        ...(user.role === 'admin'
                          ? [
                              {
                                label: t('nav.admin'),
                                to: '/admin',
                                className: 'bg-red-600 text-white hover:bg-red-700',
                              },
                            ]
                          : []),
                        ...(user.role === 'admin' || user.role === 'moderator'
                          ? [
                              {
                                label: t('common.modTools'),
                                to: '/mod/reports',
                              },
                            ]
                          : []),
                        {
                          label: t('common.logout'),
                          onClick: handleLogout,
                        },
                      ]}
                    />
                  )}

                </>
              ) : (
                <>
                  {/* Not logged in */}
                  {!isSlimMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setBugReportUrl(window.location.href);
                          setShowBugReportModal(true);
                        }}
                        className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                      >
                        {t('mainLayout.bugReporting')}
                      </button>

                      {/* Divider */}
                      <div className="h-6 w-px bg-[var(--color-border)]" />
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setAuthModal('login')}
                    className={`rounded-md ${isSlimMode ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'} font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]`}
                  >
                    {t('common.login')}
                  </button>
                  {!isSlimMode ? (
                    <button
                      type="button"
                      onClick={() => setAuthModal('signup')}
                      className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                      {t('auth.registerTitle')}
                    </button>
                  ) : (
                    <HamburgerMenu
                      items={[
                        {
                          label: t('menu.about'),
                          to: '/about',
                        },
                        {
                          label: 'Donate',
                          to: '/donate',
                        },
                        {
                          label: t('mainLayout.bugReporting'),
                          onClick: () => {
                            setBugReportUrl(window.location.href);
                            setShowBugReportModal(true);
                          },
                        },
                        {
                          label: t('auth.registerTitle'),
                          onClick: () => setAuthModal('signup'),
                          className:
                            'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]',
                        },
                      ]}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Plan expiry warning banner */}
      {(() => {
        if (user?.plan !== 'paid' || !user.plan_expires_at) return null;
        const daysLeft = Math.ceil(
          (new Date(user.plan_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysLeft > 3 || daysLeft <= 0) return null;
        return (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center text-sm text-amber-800 dark:text-amber-200">
            Your paid plan expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}.{' '}
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="font-semibold underline hover:no-underline"
            >
              Renew now
            </button>
          </div>
        );
      })()}

      {/* Main Content */}
      <main
        id="main-content"
        className={isMobile ? 'pb-[calc(56px+env(safe-area-inset-bottom))]' : ''}
      >
        <Outlet />
      </main>

      {/* Mobile tab bar - only shows on mobile (<768px), not on AI preview */}
      {isMobile && !isAIPreview && (
        <ErrorBoundary
          fallback={
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">
                {t('mainLayout.mobileNavigationError')}
              </p>
            </div>
          }
        >
          <MobileTabBar unreadCount={unreadTotal} />
        </ErrorBoundary>
      )}

      {showAboutModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-4xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <div className="max-h-[70vh] overflow-y-auto pr-2">
              <Suspense
                fallback={
                  <div className="py-6">
                    <LoadingMessage>{t('common.loading')}</LoadingMessage>
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
                {t('mainLayout.dontShowThisAgain')}
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
                {t('common.continue')}
              </button>
            </div>
          </div>
        </div>
      )}

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgraded={() => setShowUpgradeModal(false)}
      />

      <BugReportModal
        isOpen={showBugReportModal}
        onClose={() => setShowBugReportModal(false)}
        initialUrl={bugReportUrl}
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
                queryClient.invalidateQueries({
                  queryKey: ['subreddit-subscription', pendingAction.subreddit],
                });
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

      <ToastContainer
        toasts={toasts.map((toast) => ({
          ...toast,
          onDismiss: () => dismissToast(toast.id),
        }))}
      />

      {/* WebSocket connection status indicator */}
      <ConnectionStatusIndicator />
    </div>
  );
}
