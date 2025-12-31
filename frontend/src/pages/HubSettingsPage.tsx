import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hubSettingsService } from '../services/hubSettingsService';
import { useAuth } from '../contexts/AuthContext';
import GeneralSettingsTab from '../components/hubSettings/GeneralSettingsTab';
import ContentSettingsTab from '../components/hubSettings/ContentSettingsTab';
import ModerationSettingsTab from '../components/hubSettings/ModerationSettingsTab';
import ModeratorsTab from '../components/hubSettings/ModeratorsTab';
import ThemeTab from '../components/hubSettings/ThemeTab';

type TabType = 'general' | 'content' | 'moderation' | 'moderators' | 'theme';

export default function HubSettingsPage() {
  const { hubName } = useParams<{ hubName: string }>();
  const { user } = useAuth();
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
  const canEditSettings = userMod && (userMod.role === 'owner' || userMod.role === 'full_moderator');

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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)] mx-auto"></div>
          <p className="mt-4 text-[var(--color-text-secondary)]">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--color-text-primary)]">Settings not found</p>
        </div>
      </div>
    );
  }

  if (!canEditSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-4">
            Access Denied
          </h2>
          <p className="text-[var(--color-text-secondary)]">
            You need to be a hub owner or full moderator to access settings.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'content', label: 'Content & Posts' },
    { id: 'moderation', label: 'Moderation' },
    { id: 'moderators', label: 'Moderators' },
    { id: 'theme', label: 'Theme' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
            h/{hubName} Settings
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Configure your hub's appearance, content rules, and moderation settings
          </p>
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
            {saveStatus === 'saving' && 'Saving changes...'}
            {saveStatus === 'saved' && '✓ Changes saved successfully!'}
            {saveStatus === 'error' && '✗ Failed to save changes. Please try again.'}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-[var(--color-border)] mb-6">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-4 px-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-medium'
                    : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
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
              isOwner={userMod?.role === 'owner'}
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
          {activeTab === 'theme' && <ThemeTab hubName={hubName} />}
        </div>
      </div>
    </div>
  );
}
