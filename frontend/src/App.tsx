import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { RedditBlockProvider } from './contexts/RedditBlockContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ThemesPage from './pages/ThemesPage';
import RedditPage from './pages/RedditPage';
import RedditPostWrapper from './pages/RedditPostWrapper';
import RedditUserPage from './pages/RedditUserPage';
import UserProfilePage from './pages/UserProfilePage';
import HubsPage from './pages/HubsPage';
import CreateHubPage from './pages/CreateHubPage';
import CreatePostPage from './pages/CreatePostPage';
import PostsPage from './pages/PostsPage';
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
            <Routes>
          {/* Auth routes - no layout */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* PUBLIC routes - accessible without auth */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/reddit" element={<RedditPage />} />
            <Route path="/reddit/r/:subreddit" element={<RedditPage />} />
            <Route path="/reddit/r/:subreddit/comments/:postId" element={<RedditPostWrapper />} />
            <Route
              path="/reddit/r/:subreddit/comments/:postId/:commentId"
              element={<RedditPostWrapper />}
            />
            <Route path="/reddit/user/:username" element={<RedditUserPage />} />
            <Route path="/hubs" element={<HubsPage />} />
            <Route path="/hubs/h/:hubname" element={<HubsPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/posts/:postId/comments/:commentId" element={<PostDetailPage />} />
            <Route path="/users/:username" element={<UserProfilePage />} />
          </Route>

          {/* PROTECTED routes - require auth */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/posts/create" element={<CreatePostPage />} />
            <Route path="/hubs/create" element={<CreateHubPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/themes" element={<ThemesPage />} />
          </Route>

          {/* 404 */}
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </RedditBlockProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
