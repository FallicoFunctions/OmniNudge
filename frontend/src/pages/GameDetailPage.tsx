import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { PageShell } from '../components/common/PageShell';
import { useAuth } from '../contexts/AuthContext';
import { omnigameService } from '../services/omnigameService';
import type { OmniGameLaunchMode } from '../types/omnigame';

export default function GameDetailPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [isLaunching, setIsLaunching] = useState<OmniGameLaunchMode | null>(null);
  const [launchError, setLaunchError] = useState('');
  const game = omnigameService.getGame('omnirave');

  if (!game) {
    return <Navigate to="/games" replace />;
  }

  const handleLaunch = async (mode: OmniGameLaunchMode) => {
    setIsLaunching(mode);
    setLaunchError('');

    try {
      const launch = await omnigameService.createOmniRaveLaunch(mode);
      window.location.assign(launch.launch_url);
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : t('gameDetailPage.launchError'));
      setIsLaunching(null);
    }
  };

  const handleSignedInLaunch = () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
      return;
    }

    void handleLaunch('account');
  };

  return (
    <PageShell className="max-w-5xl" panelClassName="space-y-8 p-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-primary)]">
          {t('gameDetailPage.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">{game.name}</h1>
        <p className="max-w-3xl text-base text-[var(--color-text-secondary)]">{game.summary}</p>
      </header>

      <section className="grid gap-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('gameDetailPage.signedInTitle')}
          </h2>
          <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{game.signedInDescription}</p>
          <button
            type="button"
            onClick={handleSignedInLaunch}
            disabled={isLaunching !== null}
            className="inline-flex rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLaunching === 'account' ? t('gameDetailPage.launchingSignedIn') : t('gameDetailPage.launchSignedIn')}
          </button>
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('gameDetailPage.guestTitle')}
          </h2>
          <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{game.guestDescription}</p>
          <button
            type="button"
            onClick={() => void handleLaunch('guest')}
            disabled={isLaunching !== null}
            className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLaunching === 'guest' ? t('gameDetailPage.launchingGuest') : t('gameDetailPage.launchGuest')}
          </button>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            {t('gameDetailPage.zoneLabel')}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-primary)]">{t('gameDetailPage.zoneValue')}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            {t('gameDetailPage.mediaLabel')}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-primary)]">{t('gameDetailPage.mediaValue')}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            {t('gameDetailPage.mobileLabel')}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-primary)]">{t('gameDetailPage.mobileValue')}</p>
        </div>
      </section>

      {launchError ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{launchError}</p>
      ) : null}
    </PageShell>
  );
}
