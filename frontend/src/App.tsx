import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { RedditBlockProvider } from './contexts/RedditBlockContext';
import { MessagingProvider } from './contexts/MessagingContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import HomePage from './pages/HomePage';
import ThemesPage from './pages/ThemesPage';
import SubredditPage from './pages/SubredditPage';
import RedditPostWrapper from './pages/RedditPostWrapper';
import RedditUserPage from './pages/RedditUserPage';
import RedditWikiPage from './pages/RedditWikiPage';
import UserProfilePage from './pages/UserProfilePage';
import HubPage from './pages/HubPage';
import SearchResultsPage from './pages/SearchResultsPage';
import CreateHubPage from './pages/CreateHubPage';
import CreatePostPage from './pages/CreatePostPage';
import PostDetailPage from './pages/PostDetailPage';
import MessagesPage from './pages/MessagesPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <RedditBlockProvider>
            <MessagingProvider>
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
                  <Route path="/h/:hubname" element={<HubPage />} />
                  <Route path="/posts/:postId" element={<PostDetailPage />} />
                  <Route path="/posts/:postId/comments/:commentId" element={<PostDetailPage />} />
                  <Route path="/users/:username" element={<UserProfilePage />} />
                  <Route path="/search" element={<SearchResultsPage />} />

                  {/* PROTECTED routes - require auth */}
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
                </Route>

                {/* 404 */}
                <Route path="/404" element={<NotFoundPage />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
            </MessagingProvider>
          </RedditBlockProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
