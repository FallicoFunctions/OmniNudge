import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageShell } from '../components/common/PageShell';
import { omnigameService } from '../services/omnigameService';

export default function GamesPage() {
  const { t } = useTranslation();
  const games = omnigameService.getCatalog();

  return (
    <PageShell className="max-w-6xl" panelClassName="space-y-8 p-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-primary)]">
          {t('gamesPage.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">{t('gamesPage.title')}</h1>
        <p className="max-w-3xl text-base text-[var(--color-text-secondary)]">{t('gamesPage.description')}</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {games.map((game) => (
          <article
            key={game.slug}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-primary)]">
              {t('gamesPage.availableNow')}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--color-text-primary)]">{game.name}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{game.hero}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">{game.summary}</p>
            <Link
              to={`/games/${game.slug}`}
              className="mt-6 inline-flex rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t('gamesPage.viewGame')}
            </Link>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
