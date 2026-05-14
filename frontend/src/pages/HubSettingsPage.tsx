import { useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { hubSettingsService } from '../services/hubSettingsService';
import { useAuth } from '../contexts/AuthContext';
import GeneralSettingsTab from '../components/hubSettings/GeneralSettingsTab';
import ContentSettingsTab from '../components/hubSettings/ContentSettingsTab';
import ModerationSettingsTab from '../components/hubSettings/ModerationSettingsTab';
import ModeratorsTab from '../components/hubSettings/ModeratorsTab';
import HubAIDesignerTab from '../components/hubSettings/HubAIDesignerTab';
import { LoadingMessage } from '../components/common/StatusMessage';
import { EmptyState, PermissionDenied } from '../components/empty';
import { isAdmin } from '../utils/permissions';

type TabType = 'general' | 'content' | 'moderation' | 'moderators' | 'ai-designer';

export default function HubSettingsPage() {
  const { hubName } = useParams<{ hubName: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Fetch hub settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['hubSettings', hubName],
    queryFn: () => hubSettingsService.getHubSettings(hubName!),
    enabled: !!hubName,
  });

  // Fetch moderators to check permissions
  const { data: moderatorsData } = useQuery({
    queryKey: ['hubModerators', hubName],
    queryFn: () => hubSettingsService.getHubModerators(hubName!),
    enabled: !!hubName,
  });

  // Check if user is a moderator with settings access
  const userMod = moderatorsData?.moderators.find((mod) => mod.user_id === user?.id);
  const canEditSettings =
    isAdmin(user?.role) ||
    (userMod !== undefined && (userMod.role === 'owner' || userMod.role === 'full_moderator'));

  // Check if user is hub owner or admin (for owner-only settings)
  const isHubOwnerOrAdmin =
    isAdmin(user?.role) || userMod?.role === 'owner';

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof hubSettingsService.updateHubSettings>[1]) =>
      hubSettingsService.updateHubSettings(hubName!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubSettings', hubName] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  if (!hubName) {
    return <Navigate to="/" />;
  }

  if (settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingMessage>{t('hubSettingsPage.loading')}</LoadingMessage>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <EmptyState illustration="noData" title={t('hubSettingsPage.notFound')} />
      </div>
    );
  }

  if (!canEditSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PermissionDenied resource={t('common.format.hubPath', { name: hubName })} />
      </div>
    );
  }

  // SETTINGS-1: Add counts and grouping to tabs
  const moderatorCount = moderatorsData?.moderators?.length || 0;

  const tabs: { id: TabType; label: string; group?: string }[] = [
    { id: 'general', label: t('hubSettingsPage.tabs.general'), group: 'settings' },
    { id: 'content', label: t('hubSettingsPage.tabs.content'), group: 'settings' },
    { id: 'moderation', label: t('hubSettingsPage.tabs.moderation'), group: 'settings' },
    {
      id: 'moderators',
      label: t('hubSettingsPage.tabs.moderators', { count: moderatorCount }),
      group: 'team',
    },
    { id: 'ai-designer', label: 'AI Designer', group: 'appearance' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
              {t('hubSettingsPage.header.title', { hub: hubName })}
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              {t('hubSettingsPage.header.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/h/${hubName}`)}
              className="px-4 py-2 rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)] transition-colors"
            >
              {t('hubSettingsPage.actions.exit')}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/h/${hubName}/mod`)}
              className="px-4 py-2 rounded border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
            >
              {t('hubSettingsPage.actions.backToModTools')}
            </button>
          </div>
        </div>

        {/* Save Status Banner */}
        {saveStatus !== 'idle' && (
          <div
            className={`mb-6 p-4 rounded ${
              saveStatus === 'saving'
                ? 'bg-blue-100 text-blue-800'
                : saveStatus === 'saved'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {saveStatus === 'saving' && t('hubSettingsPage.saveBanner.saving')}
            {saveStatus === 'saved' && t('hubSettingsPage.saveBanner.saved')}
            {saveStatus === 'error' && t('hubSettingsPage.saveBanner.error')}
          </div>
        )}

        {/* Tabs - SETTINGS-1: Grouped with visual separators */}
        <div className="border-b border-[var(--color-border)] mb-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            {tabs.map((tab, index) => {
              const prevGroup = index > 0 ? tabs[index - 1].group : null;
              const showDivider = tab.group && prevGroup && tab.group !== prevGroup;

              return (
                <div key={tab.id} className="flex items-center gap-x-8">
                  {showDivider && (
                    <div className="h-6 w-px bg-[var(--color-border)]" />
                  )}
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-4 px-2 border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-medium'
                        : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-[var(--color-surface)] rounded-lg shadow-md p-6">
          {activeTab === 'general' && (
            <GeneralSettingsTab
              settings={settings}
              onSave={(data) => {
                setSaveStatus('saving');
                updateMutation.mutate(data);
              }}
              isHubOwnerOrAdmin={isHubOwnerOrAdmin}
              hubName={hubName!}
            />
          )}
          {activeTab === 'content' && (
            <ContentSettingsTab
              settings={settings}
              onSave={(data) => {
                setSaveStatus('saving');
                updateMutation.mutate(data);
              }}
            />
          )}
          {activeTab === 'moderation' && (
            <ModerationSettingsTab
              settings={settings}
              onSave={(data) => {
                setSaveStatus('saving');
                updateMutation.mutate(data);
              }}
            />
          )}
          {activeTab === 'moderators' && (
            <ModeratorsTab hubName={hubName} isOwner={userMod?.role === 'owner'} />
          )}
          {activeTab === 'ai-designer' && <HubAIDesignerTab hubName={hubName} />}
        </div>
      </div>
    </div>
  );
}
