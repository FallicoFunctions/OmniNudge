import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeSelector from '../components/themes/ThemeSelector';

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
              <ThemeSelector />
              {user && (
                <>
                  <Link
                    to={`/profile/${user.username}`}
                    className="text-sm font-medium text-[var(--color-text-primary)]"
                  >
                    {user.username}
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
