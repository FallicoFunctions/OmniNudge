import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageShell } from '../components/common/PageShell';
import { omnigameService } from '../services/omnigameService';

export default function GamesPage() {
  const { t } = useTranslation();
  const games = omnigameService.getCatalog();
  const coverClasses = [
    'from-[#081526] via-[#26134b] to-[#ff5fb4]',
    'from-[#031018] via-[#0d2631] to-[#4af6d6]',
  ];

  return (
    <PageShell className="max-w-6xl" panelClassName="space-y-8 p-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-primary)]">
          {t('gamesPage.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">{t('gamesPage.title')}</h1>
        <p className="max-w-3xl text-base text-[var(--color-text-secondary)]">{t('gamesPage.description')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {games.map((game, index) => (
          <article
            key={game.slug}
            className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${coverClasses[index % coverClasses.length]} text-white shadow-[0_24px_70px_rgba(0,0,0,0.24)]`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_42%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(4,8,14,0.82))]" />
            <div className="relative flex min-h-[22rem] flex-col justify-between p-6 sm:p-8">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/72">
                  {t('gamesPage.availableNow')}
                </p>
                <h2 className="text-3xl font-semibold tracking-tight">{game.name}</h2>
                <p className="max-w-md text-sm uppercase tracking-[0.28em] text-white/65">{t(game.heroKey)}</p>
              </div>

              <div className="space-y-5">
                <p className="max-w-lg text-base leading-7 text-white/82">{t(game.summaryKey)}</p>
                <Link
                  to={`/games/${game.slug}`}
                  className="inline-flex rounded-full border border-white/20 bg-white/12 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-transform hover:-translate-y-0.5"
                >
                  {t('gamesPage.viewGame')}
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
