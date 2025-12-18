import { useEffect } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useMessagingContext } from '../contexts/MessagingContext';
import ThemeSelector from '../components/themes/ThemeSelector';
import { usersService } from '../services/usersService';
import { messagesService } from '../services/messagesService';
import { useMessagingWebSocket } from '../hooks/useMessagingWebSocket';
import type { UserProfile } from '../types/users';

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { activeConversationId } = useMessagingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Initialize WebSocket connection for real-time messaging
  useMessagingWebSocket({ activeConversationId });

  const handleLogout = () => {
    logout();
    navigate('/login');
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
              {user && (
                <div className="hidden space-x-4 md:flex">
                  <Link
                    to="/posts/create"
                    className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                  >
                    Create Post
                  </Link>
                  <Link
                    to="/messages"
                    className="relative rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                  >
                    Messages
                    {unreadTotal > 0 && (
                      <span className="absolute -right-2 -top-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white">
                        {unreadTotal}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/hubs/create"
                    className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                  >
                    Create Hub
                  </Link>
                </div>
              )}
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
                  <Link
                    to="/login"
                    className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Sign Up
                  </Link>
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
    </div>
  );
}
