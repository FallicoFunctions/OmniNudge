import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ThemesPage from './pages/ThemesPage';
import RedditPage from './pages/RedditPage';
import RedditPostPage from './pages/RedditPostPage';
import RedditUserPage from './pages/RedditUserPage';
import PostsPage from './pages/PostsPage';
import PostDetailPage from './pages/PostDetailPage';
import MessagesPage from './pages/MessagesPage';
import SavedPage from './pages/SavedPage';
import HiddenPage from './pages/HiddenPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
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
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/posts/:postId/comments/:commentId" element={<PostDetailPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/hidden" element={<HiddenPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
