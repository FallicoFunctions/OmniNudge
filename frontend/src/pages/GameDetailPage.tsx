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
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const game = omnigameService.getGame('omnirave');

  if (!game) {
    return <Navigate to="/games" replace />;
  }

  const gallerySurfaceClasses = [
    'from-[#071423] via-[#26134b] to-[#ff4ea7]',
    'from-[#02040a] via-[#112a2f] to-[#49f5d2]',
    'from-[#12051d] via-[#401558] to-[#ffd35c]',
  ];

  const handleLaunch = async (mode: OmniGameLaunchMode) => {
    setIsLaunching(true);
    setLaunchError('');

    try {
      const launch = await omnigameService.createOmniRaveLaunch(mode);
      window.location.assign(launch.launch_url);
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : t('gameDetailPage.launchError'));
      setIsLaunching(false);
    }
  };

  const handleSignInLaunch = () => {
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
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
        <p className="max-w-3xl text-lg text-[var(--color-text-secondary)]">{t(game.summaryKey)}</p>
      </header>

      <section className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.9fr)]">
          <article className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#04070d]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_45%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(8,12,18,0.2),rgba(8,12,18,0.82))]" />
            <div className="relative aspect-[16/9] p-6 sm:p-8">
              <div className="flex h-full flex-col justify-between">
                <div className="space-y-3">
                  <span className="inline-flex rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
                    {t(game.heroKey)}
                  </span>
                  <div className="space-y-2">
                    <h2 className="max-w-xl text-2xl font-semibold text-white sm:text-3xl">
                      {t('gameDetailPage.heroTitle')}
                    </h2>
                    <p className="max-w-xl text-sm leading-6 text-white/72 sm:text-base">
                      {t('gameDetailPage.heroBody')}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {isAuthenticated ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleLaunch('account')}
                        disabled={isLaunching}
                        className="inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLaunching ? t('gameDetailPage.playing') : t('gameDetailPage.play')}
                      </button>
                      <p className="text-xs uppercase tracking-[0.25em] text-white/55">{t('gameDetailPage.accountHint')}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handleLaunch('guest')}
                          disabled={isLaunching}
                          className="inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isLaunching ? t('gameDetailPage.playing') : t('gameDetailPage.playGuest')}
                        </button>
                        <button
                          type="button"
                          onClick={handleSignInLaunch}
                          disabled={isLaunching}
                          className="inline-flex items-center rounded-full border border-white/20 bg-white/12 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('gameDetailPage.signIn')}
                        </button>
                      </div>
                      <p className="text-xs uppercase tracking-[0.25em] text-white/55">{t('gameDetailPage.signInHint')}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </article>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {game.gallery.map((panel, index) => (
              <article
                key={panel.titleKey}
                className={`relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-gradient-to-br ${gallerySurfaceClasses[index % gallerySurfaceClasses.length]} p-5 text-white`}
              >
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(6,8,12,0.76))]" />
                <div className="relative flex aspect-[16/9] flex-col justify-end">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/72">
                    {t(panel.titleKey)}
                  </p>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-white/88">{t(panel.captionKey)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-8 rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-background)] p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          {game.descriptionKeys.map((paragraphKey) => (
            <p key={paragraphKey} className="text-base leading-7 text-[var(--color-text-secondary)]">
              {t(paragraphKey)}
            </p>
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-primary)]">
            {t('gameDetailPage.highlightsTitle')}
          </h2>
          <ul className="space-y-3">
            {game.highlightKeys.map((itemKey) => (
              <li
                key={itemKey}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-sm leading-6 text-[var(--color-text-primary)]"
              >
                {t(itemKey)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {launchError ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{launchError}</p>
      ) : null}
    </PageShell>
  );
}
