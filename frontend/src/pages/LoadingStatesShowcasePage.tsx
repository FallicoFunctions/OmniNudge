import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircularProgress,
  LoadingSpinner,
  ProgressBar,
  ShimmerEffect,
  SkeletonCard,
  SkeletonList,
  SkeletonPost,
  selectLoadingPattern,
} from '../components/loading';

export default function LoadingStatesShowcasePage() {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!running) return;

    const start = Date.now();
    const timer = window.setInterval(() => {
      const nextElapsed = Date.now() - start;
      setElapsedMs(nextElapsed);
      setProgress(Math.min(100, Math.floor(nextElapsed / 90)));
    }, 100);

    return () => window.clearInterval(timer);
  }, [running]);

  const recommendedPattern = useMemo(
    () =>
      selectLoadingPattern({
        elapsedMs,
        hasKnownLayout: true,
        hasMeasurableProgress: true,
      }),
    [elapsedMs]
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          {t('loadingShowcase.title')}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('loadingShowcase.subtitle')}
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold text-[var(--color-text-primary)]">
          {t('loadingShowcase.threshold.title')}
        </h2>
        <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
          {t('loadingShowcase.threshold.description')}
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRunning(true);
              setElapsedMs(0);
              setProgress(0);
            }}
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
          >
            {t('loadingShowcase.threshold.start')}
          </button>
          <button
            type="button"
            onClick={() => {
              setRunning(false);
              setElapsedMs(0);
              setProgress(0);
            }}
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {t('loadingShowcase.threshold.reset')}
          </button>
          <div className="text-sm text-[var(--color-text-secondary)]">
            {t('loadingShowcase.threshold.elapsed', { elapsed: elapsedMs })}
          </div>
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
            {t('loadingShowcase.threshold.pattern', { pattern: recommendedPattern })}
          </div>
        </div>
        <ProgressBar value={progress} showLabel size="medium" />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('loadingShowcase.spinner.title')}
          </h3>
          <div className="flex items-center gap-4">
            <LoadingSpinner size="small" />
            <LoadingSpinner size="medium" />
            <LoadingSpinner size="large" />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('loadingShowcase.shimmer.title')}
          </h3>
          <ShimmerEffect className="h-12 w-full rounded-lg" />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('loadingShowcase.skeleton.post')}
          </h3>
          <SkeletonPost />
        </div>
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('loadingShowcase.skeleton.list')}
          </h3>
          <SkeletonList items={3} />
        </div>
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('loadingShowcase.skeleton.card')}
          </h3>
          <SkeletonCard />
        </div>
        <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('loadingShowcase.progress.title')}
          </h3>
          <ProgressBar value={42} showLabel />
          <ProgressBar size="small" />
          <div className="flex items-center gap-4">
            <CircularProgress value={67} showLabel />
            <CircularProgress />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
        <h3 className="mb-2 text-base font-semibold text-[var(--color-text-primary)]">
          {t('loadingShowcase.slow3g.title')}
        </h3>
        <ol className="list-decimal space-y-1 ps-5">
          <li>{t('loadingShowcase.slow3g.step1')}</li>
          <li>{t('loadingShowcase.slow3g.step2')}</li>
          <li>{t('loadingShowcase.slow3g.step3')}</li>
        </ol>
      </section>
    </div>
  );
}
