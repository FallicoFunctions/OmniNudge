import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ModerationDashboard } from '../components/moderation/ModerationDashboard';
import { useAuth } from '../contexts/AuthContext';

export default function ModerationReportsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-2 text-3xl font-bold">{t('moderation.dashboard.title')}</h1>
      <p className="mb-6 text-[var(--color-text-secondary)]">{t('moderation.dashboard.subtitle')}</p>
      <ModerationDashboard titleKey="moderation.dashboard.queueTitle" />
    </div>
  );
}
