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
import RedditPostPage from './pages/RedditPostPage';
import RedditUserPage from './pages/RedditUserPage';
import UserProfilePage from './pages/UserProfilePage';
import HubsPage from './pages/HubsPage';
import CreateHubPage from './pages/CreateHubPage';
import CreatePostPage from './pages/CreatePostPage';
import PostsPage from './pages/PostsPage';
import PostDetailPage from './pages/PostDetailPage';
import MessagesPage from './pages/MessagesPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <RedditBlockProvider>
            <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/themes" element={<ThemesPage />} />
            <Route path="/reddit" element={<RedditPage />} />
            <Route path="/reddit/r/:subreddit" element={<RedditPage />} />
            <Route path="/reddit/r/:subreddit/comments/:postId" element={<RedditPostPage />} />
            <Route path="/reddit/r/:subreddit/comments/:postId/:commentId" element={<RedditPostPage />} />
            <Route path="/reddit/user/:username" element={<RedditUserPage />} />
            <Route path="/users/:username" element={<UserProfilePage />} />
            <Route path="/hubs" element={<HubsPage />} />
            <Route path="/hubs/h/:hubname" element={<HubsPage />} />
            <Route path="/hubs/create" element={<CreateHubPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/posts/:postId/comments/:commentId" element={<PostDetailPage />} />
            <Route path="/posts/create" element={<CreatePostPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </RedditBlockProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
