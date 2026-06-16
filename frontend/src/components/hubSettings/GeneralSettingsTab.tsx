import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HubSettings, UpdateHubSettingsRequest, PrivacyType } from '../../types/hubSettings';
import { MarkdownInput } from '../common/MarkdownInput';
import { hubSettingsService } from '../../services/hubSettingsService';
import { FormField } from '../forms/FormField';

interface Props {
  settings: HubSettings;
  onSave: (data: UpdateHubSettingsRequest) => void;
  isHubOwnerOrAdmin: boolean;
  hubName: string;
}

export default function GeneralSettingsTab({
  settings,
  onSave,
  isHubOwnerOrAdmin,
  hubName,
}: Props) {
  const { t } = useTranslation();
  const [displayTitle, setDisplayTitle] = useState(settings.display_title || '');
  const [sidebarMarkdown, setSidebarMarkdown] = useState(settings.sidebar_markdown || '');
  const [privacyType, setPrivacyType] = useState<PrivacyType>(settings.privacy_type);
  const [isNsfw, setIsNsfw] = useState(settings.nsfw || false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null);
    setIsSaving(true);

    try {
      // First save NSFW if it changed (separate API call since it's on hub table)
      if (isNsfw !== settings.nsfw) {
        await hubSettingsService.updateHubNSFW(hubName, isNsfw);
      }

      // Then save the rest of the settings
      onSave({
        display_title: displayTitle || undefined,
        sidebar_markdown: sidebarMarkdown || undefined,
        privacy_type: privacyType,
        allow_text_posts: settings.allow_text_posts,
        allow_link_posts: settings.allow_link_posts,
        allow_image_posts: settings.allow_image_posts,
        allow_video_posts: settings.allow_video_posts,
        allow_poll_posts: settings.allow_poll_posts,
        allow_media_in_comments: settings.allow_media_in_comments,
        require_post_flair: settings.require_post_flair,
        banned_words: settings.banned_words,
        spam_filter_strength: settings.spam_filter_strength,
        new_account_filter_days: settings.new_account_filter_days,
        min_account_karma: settings.min_account_karma,
        allow_spoilers: settings.allow_spoilers,
        show_thumbnails: settings.show_thumbnails,
        enable_wiki: settings.enable_wiki,
        access_request_cooldown_days: settings.access_request_cooldown_days,
      });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : t('hubSettings.common.errors.saveFailed')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    displayTitle !== (settings.display_title || '') ||
    sidebarMarkdown !== (settings.sidebar_markdown || '') ||
    privacyType !== settings.privacy_type ||
    isNsfw !== (settings.nsfw || false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">
          {t('hubSettings.general.title')}
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-6">
          {t('hubSettings.general.subtitle')}
        </p>
      </div>

      {/* Display Title */}
      <FormField
        label={t('hubSettings.general.displayTitle.label')}
        required={false}
        helperText={t('hubSettings.general.displayTitle.helper')}
      >
        <input
          type="text"
          value={displayTitle}
          onChange={(e) => setDisplayTitle(e.target.value)}
          placeholder={t('hubSettings.general.displayTitle.placeholder')}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
          maxLength={300}
        />
      </FormField>

      {/* Sidebar Description */}
      <div>
        <MarkdownInput
          label={t('hubSettings.general.sidebar.label')}
          value={sidebarMarkdown}
          onChange={setSidebarMarkdown}
          placeholder={t('hubSettings.general.sidebar.placeholder')}
          rows={8}
          helperText={t('hubSettings.general.sidebar.helper')}
        />
      </div>

      {/* Privacy Type */}
      <div>
        <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          {t('hubSettings.general.privacy.label')}
          {!isHubOwnerOrAdmin && (
            <span className="ml-2 text-xs font-normal text-[var(--color-text-secondary)]">
              {t('hubSettings.common.ownerOnly')}
            </span>
          )}
        </label>
        <select
          value={privacyType}
          onChange={(e) => setPrivacyType(e.target.value as PrivacyType)}
          disabled={!isHubOwnerOrAdmin}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="public">{t('hubSettings.general.privacy.options.public')}</option>
          <option value="restricted">{t('hubSettings.general.privacy.options.restricted')}</option>
          <option value="private">{t('hubSettings.general.privacy.options.private')}</option>
        </select>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          {privacyType === 'public' && t('hubSettings.general.privacy.descriptions.public')}
          {privacyType === 'restricted' && t('hubSettings.general.privacy.descriptions.restricted')}
          {privacyType === 'private' && t('hubSettings.general.privacy.descriptions.private')}
        </p>
      </div>

      {/* NSFW Toggle */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-4">
            <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
              {t('hubSettings.general.nsfw.label')}
              {!isHubOwnerOrAdmin && (
                <span className="ml-2 text-xs font-normal text-[var(--color-text-secondary)]">
                  {t('hubSettings.common.ownerOnly')}
                </span>
              )}
            </label>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('hubSettings.general.nsfw.description')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isNsfw}
            onClick={() => setIsNsfw(!isNsfw)}
            disabled={!isHubOwnerOrAdmin}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
              isNsfw ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
            } ${!isHubOwnerOrAdmin ? 'opacity-50' : ''}`}
          >
            <span className="sr-only">{t('hubSettings.general.nsfw.toggleA11y')}</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isNsfw ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-[var(--color-border)]">
        {saveError && <div className="mr-4 p-2 text-sm text-red-600">{saveError}</div>}
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="px-6 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving
            ? t('hubSettings.common.status.saving')
            : t('hubSettings.common.actions.saveChanges')}
        </button>
      </div>
    </div>
  );
}
