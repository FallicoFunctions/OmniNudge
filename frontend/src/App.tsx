import { lazy, Suspense, useEffect } from 'react';
import i18n from './i18n/config';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { FeatureFlagProvider } from './contexts/FeatureFlagContext';
import { RedditBlockProvider } from './contexts/RedditBlockContext';
import { MessagingProvider } from './contexts/MessagingContext';
import { MultiColumnFeedProvider } from './contexts/MultiColumnFeedContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import { LoadingMessage } from './components/common/StatusMessage';
import { usePageTracking } from './hooks/useAnalytics';
import { analyticsService } from './services/analyticsService';
import './App.css';

const HomePage = lazy(() => import('./pages/HomePage'));
const ThemesPage = lazy(() => import('./pages/ThemesPage'));
const SubredditPage = lazy(() => import('./pages/SubredditPage'));
const RedditPostWrapper = lazy(() => import('./pages/RedditPostWrapper'));
const RedditUserPage = lazy(() => import('./pages/RedditUserPage'));
const RedditWikiPage = lazy(() => import('./pages/RedditWikiPage'));
const HubWikiPage = lazy(() => import('./pages/HubWikiPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const UserFriendsListPage = lazy(() => import('./pages/UserFriendsListPage'));
const UserActivityPage = lazy(() => import('./pages/UserActivityPage'));
const HubPage = lazy(() => import('./pages/HubPage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const HubsAndSubsPage = lazy(() => import('./pages/HubsAndSubsPage'));
const CreateHubPage = lazy(() => import('./pages/CreateHubPage'));
const CreatePostPage = lazy(() => import('./pages/CreatePostPage'));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const CCPAPage = lazy(() => import('./pages/CCPAPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const BlockedUsersPage = lazy(() => import('./pages/BlockedUsersPage'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));
const ModToolsPage = lazy(() => import('./pages/ModToolsPage'));
const HubSettingsPage = lazy(() => import('./pages/HubSettingsPage'));
const HubAIDesignerPreviewPage = lazy(() => import('./pages/HubAIDesignerPreviewPage'));
const ModMailConversationPage = lazy(() => import('./pages/ModMailConversationPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const FeatureFlagsAdminPage = lazy(() => import('./pages/FeatureFlagsAdminPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PrivateHubPage = lazy(() => import('./pages/PrivateHubPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const LoadingStatesShowcasePage = lazy(() => import('./pages/LoadingStatesShowcasePage'));
const DonatePage = lazy(() => import('./pages/DonatePage'));

// Initialize analytics on app load
function AnalyticsWrapper({ children }: { children: React.ReactNode }) {
  usePageTracking(); // Track page views

  useEffect(() => {
    // Initialize analytics service
    analyticsService.init({
      enabled: import.meta.env.PROD, // Only enable in production
      debug: import.meta.env.DEV,
    });
  }, []);

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AnalyticsWrapper>
        <AuthProvider>
          <SettingsProvider>
            <WebSocketProvider>
              <FeatureFlagProvider>
                <RedditBlockProvider>
                  <MessagingProvider>
                    <MultiColumnFeedProvider>
                      <Suspense
                        fallback={
                          <div className="flex min-h-screen items-center justify-center">
                            <LoadingMessage>{i18n.t('common.loading')}</LoadingMessage>
                          </div>
                        }
                      >
                        <Routes>
                          {/* Main layout for public + protected pages */}
                          <Route element={<MainLayout />}>
                            {/* PUBLIC routes - accessible without auth */}
                            <Route path="/" element={<HomePage />} />
                            <Route path="/r/:subreddit" element={<SubredditPage />} />
                            <Route
                              path="/r/:subreddit/wiki/revisions/:pagePath"
                              element={<RedditWikiPage mode="history" />}
                            />
                            <Route
                              path="/r/:subreddit/wiki/revisions"
                              element={<RedditWikiPage mode="history" />}
                            />
                            <Route
                              path="/r/:subreddit/wiki/discussions/:pagePath"
                              element={<RedditWikiPage mode="talk" />}
                            />
                            <Route
                              path="/r/:subreddit/wiki/discussions"
                              element={<RedditWikiPage mode="talk" />}
                            />
                            <Route
                              path="/r/:subreddit/wiki/:pagePath"
                              element={<RedditWikiPage mode="view" />}
                            />
                            <Route
                              path="/r/:subreddit/wiki"
                              element={<RedditWikiPage mode="view" />}
                            />
                            <Route path="/wiki/:pagePath" element={<RedditWikiPage />} />
                            <Route path="/wiki" element={<RedditWikiPage />} />
                            <Route
                              path="/r/:subreddit/comments/:postId"
                              element={<RedditPostWrapper />}
                            />
                            <Route
                              path="/r/:subreddit/comments/:postId/:commentId"
                              element={<RedditPostWrapper />}
                            />
                            <Route path="/user/:username" element={<RedditUserPage />} />
                            <Route path="/h/:hubname/private" element={<PrivateHubPage />} />
                            <Route path="/h/:hubname" element={<HubPage />} />
                            <Route path="/h/:hubname/wiki/:pagePath" element={<HubWikiPage />} />
                            <Route path="/h/:hubname/wiki" element={<HubWikiPage />} />
                            <Route
                              path="/h/:hubname/comments/:postId"
                              element={<PostDetailPage />}
                            />
                            <Route
                              path="/h/:hubname/comments/:postId/:commentId"
                              element={<PostDetailPage />}
                            />
                            <Route path="/posts/:postId" element={<PostDetailPage />} />
                            <Route
                              path="/posts/:postId/comments/:commentId"
                              element={<PostDetailPage />}
                            />
                            <Route path="/users/:username" element={<UserProfilePage />} />
                            <Route
                              path="/users/:username/friends"
                              element={<UserFriendsListPage />}
                            />
                            <Route
                              path="/users/:username/activity"
                              element={<UserActivityPage />}
                            />
                            <Route path="/search" element={<SearchResultsPage />} />
                            <Route path="/hubs" element={<HubsAndSubsPage />} />
                            <Route path="/about" element={<AboutPage />} />
                            <Route path="/donate" element={<DonatePage />} />
                            <Route path="/terms" element={<TermsPage />} />
                            <Route path="/privacy" element={<PrivacyPage />} />
                            <Route path="/ccpa" element={<CCPAPage />} />
                            <Route path="/reset-password" element={<ResetPasswordPage />} />
                            <Route path="/verify-email" element={<VerifyEmailPage />} />
                            {import.meta.env.DEV && (
                              <Route
                                path="/dev/loading-states"
                                element={<LoadingStatesShowcasePage />}
                              />
                            )}

                            {/* PROTECTED routes - require auth */}
                            <Route
                              path="/h/:hubName/mod"
                              element={
                                <ProtectedRoute>
                                  <ModToolsPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/h/:hubName/settings"
                              element={
                                <ProtectedRoute>
                                  <HubSettingsPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/mod-mail/:conversationId"
                              element={
                                <ProtectedRoute>
                                  <ModMailConversationPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/posts/create"
                              element={
                                <ProtectedRoute>
                                  <CreatePostPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/hubs/create"
                              element={
                                <ProtectedRoute>
                                  <CreateHubPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/messages"
                              element={
                                <ProtectedRoute>
                                  <MessagesPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/settings"
                              element={
                                <ProtectedRoute>
                                  <SettingsPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/settings/blocked-users"
                              element={
                                <ProtectedRoute>
                                  <BlockedUsersPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/friends"
                              element={
                                <ProtectedRoute>
                                  <FriendsPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/themes"
                              element={
                                <ProtectedRoute>
                                  <ThemesPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/admin"
                              element={
                                <ProtectedRoute>
                                  <AdminPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/admin/feature-flags"
                              element={
                                <ProtectedRoute>
                                  <FeatureFlagsAdminPage />
                                </ProtectedRoute>
                              }
                            />
                          </Route>

                          {/* Full-screen pages (no navbar/layout) */}
                          <Route
                            path="/h/:hubName/ai-design/preview/:designId"
                            element={
                              <ProtectedRoute>
                                <HubAIDesignerPreviewPage />
                              </ProtectedRoute>
                            }
                          />

                          {/* 404 */}
                          <Route path="/404" element={<NotFoundPage />} />
                          <Route path="*" element={<Navigate to="/404" replace />} />
                        </Routes>
                      </Suspense>
                    </MultiColumnFeedProvider>
                  </MessagingProvider>
                </RedditBlockProvider>
              </FeatureFlagProvider>
            </WebSocketProvider>
          </SettingsProvider>
        </AuthProvider>
      </AnalyticsWrapper>
    </BrowserRouter>
  );
}

export default App;
