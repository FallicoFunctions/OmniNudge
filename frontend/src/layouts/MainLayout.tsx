import { useEffect } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import ThemeSelector from '../components/themes/ThemeSelector';
import { usersService } from '../services/usersService';
import type { UserProfile } from '../types/users';

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
  }, [user?.id, user?.username, location.pathname, queryClient]);

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
                <Link
                  to="/reddit"
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Reddit
                </Link>
                <Link
                  to="/hubs"
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Hubs
                </Link>
                <Link
                  to="/posts"
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Posts
                </Link>
                <Link
                  to="/messages"
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Messages
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <ThemeSelector variant="toolbar" />
              {user && (
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
