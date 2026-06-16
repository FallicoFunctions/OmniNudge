import { useTranslation } from 'react-i18next';
import { PageShell } from '../components/common/PageShell';
import { useFormat } from '../hooks/useFormat';

const TERMS_EFFECTIVE_DATE_ISO = '2026-01-10';

export default function TermsPage() {
  const { t } = useTranslation();
  const { formatDate } = useFormat();

  const effectiveDate = formatDate(new Date(TERMS_EFFECTIVE_DATE_ISO), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
        {t('termsPage.title')}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        {t('common.effectiveDate', { date: effectiveDate })}
      </p>

      <div className="mt-6 space-y-6 text-sm text-[var(--color-text-secondary)]">
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.acceptance.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.acceptance.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.whoWeAre.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.whoWeAre.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.notReddit.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.notReddit.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.accounts.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.accounts.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.conduct.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.conduct.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.messaging.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.messaging.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.intellectualProperty.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.intellectualProperty.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.availability.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.availability.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.disclaimer.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.disclaimer.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.limitation.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.limitation.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('termsPage.sections.aiAgents.title')}
          </h2>
          <p className="mt-2">{t('termsPage.sections.aiAgents.body')}</p>
        </section>
      </div>
    </PageShell>
  );
}
