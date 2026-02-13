import { useTranslation } from 'react-i18next';
import { PageShell } from '../components/common/PageShell';
import { useFormat } from '../hooks/useFormat';

const PRIVACY_EFFECTIVE_DATE_ISO = '2026-01-10';

export default function PrivacyPage() {
  const { t } = useTranslation();
  const { formatDate } = useFormat();

  const effectiveDate = formatDate(new Date(PRIVACY_EFFECTIVE_DATE_ISO), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
        {t('privacyPage.title')}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        {t('common.effectiveDate', { date: effectiveDate })}
      </p>

      <div className="mt-6 space-y-6 text-sm text-[var(--color-text-secondary)]">
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.collect.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.collect.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.use.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.use.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.reddit.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.reddit.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.messaging.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.messaging.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.cookies.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.cookies.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.sharing.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.sharing.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.retention.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.retention.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.choices.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.choices.body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('privacyPage.sections.changes.title')}
          </h2>
          <p className="mt-2">{t('privacyPage.sections.changes.body')}</p>
        </section>
      </div>
    </PageShell>
  );
}

