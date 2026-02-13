/**
 * P0-033: CCPA Compliance Page
 *
 * California Consumer Privacy Act compliance page.
 * Required for users in California.
 */

import { useTranslation } from 'react-i18next';
import { useFormat } from '../hooks/useFormat';

const CCPA_LAST_UPDATED_ISO = '2026-02-01';

export default function CCPAPage() {
  const { t } = useTranslation();
  const { formatDate } = useFormat();

  const lastUpdated = formatDate(new Date(CCPA_LAST_UPDATED_ISO), {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold text-[var(--color-text-primary)]">
          {t('ccpaPage.title')}
        </h1>

        <div className="space-y-6 text-[var(--color-text-primary)]">
          <section>
            <h2 className="mb-3 text-xl font-semibold">{t('ccpaPage.sections.ccpa.title')}</h2>
            <p className="leading-relaxed text-[var(--color-text-secondary)]">
              {t('ccpaPage.sections.ccpa.body')}
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{t('ccpaPage.sections.rights.title')}</h2>
            <ul className="list-disc space-y-2 pl-6 text-[var(--color-text-secondary)]">
              <li>
                <strong>{t('ccpaPage.rights.know.label')}</strong>{' '}
                {t('ccpaPage.rights.know.description')}
              </li>
              <li>
                <strong>{t('ccpaPage.rights.delete.label')}</strong>{' '}
                {t('ccpaPage.rights.delete.description')}
              </li>
              <li>
                <strong>{t('ccpaPage.rights.optOut.label')}</strong>{' '}
                {t('ccpaPage.rights.optOut.description')}
              </li>
              <li>
                <strong>{t('ccpaPage.rights.nonDiscrimination.label')}</strong>{' '}
                {t('ccpaPage.rights.nonDiscrimination.description')}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{t('ccpaPage.sections.doNotSell.title')}</h2>
            <p className="mb-4 leading-relaxed text-[var(--color-text-secondary)]">
              {t('ccpaPage.sections.doNotSell.body')}
            </p>
            <div className="rounded-md bg-blue-500/10 p-4">
              <p className="font-semibold text-blue-600 dark:text-blue-400">
                ✓ {t('ccpaPage.sections.doNotSell.notice')}
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{t('ccpaPage.sections.collect.title')}</h2>
            <p className="mb-3 text-[var(--color-text-secondary)]">
              {t('ccpaPage.sections.collect.body')}
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[var(--color-text-secondary)]">
              <li>{t('ccpaPage.sections.collect.items.identifiers')}</li>
              <li>{t('ccpaPage.sections.collect.items.networkActivity')}</li>
              <li>{t('ccpaPage.sections.collect.items.geolocation')}</li>
              <li>{t('ccpaPage.sections.collect.items.inferences')}</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{t('ccpaPage.sections.exercise.title')}</h2>
            <p className="mb-4 text-[var(--color-text-secondary)]">
              {t('ccpaPage.sections.exercise.body')}
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[var(--color-text-secondary)]">
              <li>
                <strong>{t('ccpaPage.sections.exercise.items.exportData.label')}</strong>{' '}
                {t('ccpaPage.sections.exercise.items.exportData.prefix')}{' '}
                <a href="/settings" className="text-[var(--color-primary)] hover:underline">
                  {t('ccpaPage.sections.exercise.items.exportData.linkText')}
                </a>
              </li>
              <li>
                <strong>{t('ccpaPage.sections.exercise.items.deleteAccount.label')}</strong>{' '}
                {t('ccpaPage.sections.exercise.items.deleteAccount.prefix')}{' '}
                <a href="/settings" className="text-[var(--color-primary)] hover:underline">
                  {t('ccpaPage.sections.exercise.items.deleteAccount.linkText')}
                </a>
              </li>
              <li>
                <strong>{t('ccpaPage.sections.exercise.items.otherRequests.label')}</strong>{' '}
                {t('ccpaPage.sections.exercise.items.otherRequests.prefix')}{' '}
                <a
                  href={`mailto:${t('common.contact.privacyEmail')}`}
                  className="text-[var(--color-primary)] hover:underline"
                >
                  {t('common.contact.privacyEmail')}
                </a>
              </li>
            </ul>
            <p className="mt-4 text-sm text-[var(--color-text-muted)]">
              {t('ccpaPage.sections.exercise.responseNote')}
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{t('ccpaPage.sections.agent.title')}</h2>
            <p className="text-[var(--color-text-secondary)]">
              {t('ccpaPage.sections.agent.body')}
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{t('ccpaPage.sections.contact.title')}</h2>
            <p className="text-[var(--color-text-secondary)]">
              {t('ccpaPage.sections.contact.body')}
            </p>
            <div className="mt-3 rounded-md bg-[var(--color-bg-secondary)] p-4">
              <p className="text-[var(--color-text-secondary)]">
                <strong>{t('ccpaPage.sections.contact.emailLabel')}</strong>{' '}
                <a
                  href={`mailto:${t('common.contact.privacyEmail')}`}
                  className="text-[var(--color-primary)] hover:underline"
                >
                  {t('common.contact.privacyEmail')}
                </a>
              </p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                <strong>{t('ccpaPage.sections.contact.subjectLabel')}</strong>{' '}
                {t('ccpaPage.sections.contact.subjectValue')}
              </p>
            </div>
          </section>

          <section className="border-t border-[var(--color-border)] pt-6">
            <p className="text-sm text-[var(--color-text-muted)]">
              {t('common.lastUpdated', { date: lastUpdated })}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
