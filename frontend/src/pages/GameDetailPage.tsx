import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { PageShell } from '../components/common/PageShell';
import { useAuth } from '../contexts/AuthContext';
import { omnigameService } from '../services/omnigameService';

export default function GameDetailPage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const game = omnigameService.getGame('omnirave');

  if (!game) {
    return <Navigate to="/games" replace />;
  }

  const handleLaunch = async () => {
    setIsLaunching(true);
    setLaunchError('');

    try {
      const launch = await omnigameService.createOmniRaveLaunch(
        isAuthenticated ? 'account' : 'guest'
      );
      window.location.assign(launch.launch_url);
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : t('gameDetailPage.launchError'));
      setIsLaunching(false);
    }
  };

  return (
    <PageShell className="max-w-6xl" panelClassName="space-y-10 p-8">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-primary)]">
          {t('gameDetailPage.eyebrow')}
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-5xl">
          {game.name}
        </h1>
      </header>

      <section>
        <article className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#04070d]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_45%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(8,12,18,0.2),rgba(8,12,18,0.82))]" />
          <div className="relative flex aspect-[16/9] flex-col justify-end p-6 sm:p-8">
            <div>
              <button
                type="button"
                onClick={() => void handleLaunch()}
                disabled={isAuthLoading || isLaunching}
                className="inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLaunching ? t('gameDetailPage.playing') : t('gameDetailPage.play')}
              </button>
            </div>
          </div>
        </article>
      </section>

      {launchError ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {launchError}
        </p>
      ) : null}
    </PageShell>
  );
}
