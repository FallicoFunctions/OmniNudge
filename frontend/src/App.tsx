import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { RedditBlockProvider } from './contexts/RedditBlockContext';
import { MessagingProvider } from './contexts/MessagingContext';
import { MultiColumnFeedProvider } from './contexts/MultiColumnFeedContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import { LoadingMessage } from './components/common/StatusMessage';
import './App.css';

const HomePage = lazy(() => import('./pages/HomePage'));
const ThemesPage = lazy(() => import('./pages/ThemesPage'));
const SubredditPage = lazy(() => import('./pages/SubredditPage'));
const RedditPostWrapper = lazy(() => import('./pages/RedditPostWrapper'));
const RedditUserPage = lazy(() => import('./pages/RedditUserPage'));
const RedditWikiPage = lazy(() => import('./pages/RedditWikiPage'));
const HubWikiPage = lazy(() => import('./pages/HubWikiPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const HubPage = lazy(() => import('./pages/HubPage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const HubsAndSubsPage = lazy(() => import('./pages/HubsAndSubsPage'));
const CreateHubPage = lazy(() => import('./pages/CreateHubPage'));
const CreatePostPage = lazy(() => import('./pages/CreatePostPage'));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ModToolsPage = lazy(() => import('./pages/ModToolsPage'));
const HubSettingsPage = lazy(() => import('./pages/HubSettingsPage'));
const ModMailConversationPage = lazy(() => import('./pages/ModMailConversationPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const BugReportingPage = lazy(() => import('./pages/BugReportingPage'));
const PrivateHubPage = lazy(() => import('./pages/PrivateHubPage'));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <RedditBlockProvider>
            <MessagingProvider>
              <MultiColumnFeedProvider>
                <Suspense
                  fallback={
                    <div className="flex min-h-screen items-center justify-center">
                      <LoadingMessage>Loading page...</LoadingMessage>
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
                    <Route path="/r/:subreddit/wiki/revisions" element={<RedditWikiPage mode="history" />} />
                    <Route
                      path="/r/:subreddit/wiki/discussions/:pagePath"
                      element={<RedditWikiPage mode="talk" />}
                    />
                    <Route path="/r/:subreddit/wiki/discussions" element={<RedditWikiPage mode="talk" />} />
                    <Route path="/r/:subreddit/wiki/:pagePath" element={<RedditWikiPage mode="view" />} />
                    <Route path="/r/:subreddit/wiki" element={<RedditWikiPage mode="view" />} />
                    <Route path="/wiki/:pagePath" element={<RedditWikiPage />} />
                    <Route path="/wiki" element={<RedditWikiPage />} />
                    <Route path="/r/:subreddit/comments/:postId" element={<RedditPostWrapper />} />
                    <Route
                      path="/r/:subreddit/comments/:postId/:commentId"
                      element={<RedditPostWrapper />}
                    />
                    <Route path="/user/:username" element={<RedditUserPage />} />
                    <Route path="/h/:hubname/private" element={<PrivateHubPage />} />
                    <Route path="/h/:hubname" element={<HubPage />} />
                    <Route path="/h/:hubname/wiki/:pagePath" element={<HubWikiPage />} />
                    <Route path="/h/:hubname/wiki" element={<HubWikiPage />} />
                    <Route path="/h/:hubname/comments/:postId" element={<PostDetailPage />} />
                    <Route path="/h/:hubname/comments/:postId/:commentId" element={<PostDetailPage />} />
                    <Route path="/posts/:postId" element={<PostDetailPage />} />
                    <Route path="/posts/:postId/comments/:commentId" element={<PostDetailPage />} />
                    <Route path="/users/:username" element={<UserProfilePage />} />
                    <Route path="/search" element={<SearchResultsPage />} />
                    <Route path="/hubs" element={<HubsAndSubsPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/bug-reporting" element={<BugReportingPage />} />

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
                  </Route>

                  {/* 404 */}
                  <Route path="/404" element={<NotFoundPage />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                  </Routes>
                </Suspense>
              </MultiColumnFeedProvider>
            </MessagingProvider>
          </RedditBlockProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
