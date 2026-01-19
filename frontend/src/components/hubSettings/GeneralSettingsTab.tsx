import { useState } from 'react';
import type { HubSettings, UpdateHubSettingsRequest, PrivacyType } from '../../types/hubSettings';
import { MarkdownInput } from '../common/MarkdownInput';
import { hubSettingsService } from '../../services/hubSettingsService';

interface Props {
  settings: HubSettings;
  onSave: (data: UpdateHubSettingsRequest) => void;
  isHubOwnerOrAdmin: boolean;
  hubName: string;
}

export default function GeneralSettingsTab({ settings, onSave, isHubOwnerOrAdmin, hubName }: Props) {
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
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save changes');
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
          General Settings
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-6">
          Configure basic information and appearance for your hub
        </p>
      </div>

      {/* Display Title */}
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          Display Title
        </label>
        <input
          type="text"
          value={displayTitle}
          onChange={(e) => setDisplayTitle(e.target.value)}
          placeholder="Leave empty to use hub name"
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          maxLength={300}
        />
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          Custom title shown on the hub page (optional)
        </p>
      </div>

      {/* Sidebar Description */}
      <div>
        <MarkdownInput
          label="Sidebar Description"
          value={sidebarMarkdown}
          onChange={setSidebarMarkdown}
          placeholder="Markdown supported..."
          rows={8}
          helperText="Displayed in the hub sidebar. Supports Markdown formatting."
        />
      </div>

      {/* Privacy Type */}
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          Hub Privacy
          {!isHubOwnerOrAdmin && (
            <span className="ml-2 text-xs text-[var(--color-text-secondary)]">(Owner only)</span>
          )}
        </label>
        <select
          value={privacyType}
          onChange={(e) => setPrivacyType(e.target.value as PrivacyType)}
          disabled={!isHubOwnerOrAdmin}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="public">Public - Anyone can view and post</option>
          <option value="restricted">Restricted - Anyone can view, approved users can post</option>
          <option value="private">Private - Only approved users can view and post</option>
        </select>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          {privacyType === 'public' && 'Open to all users'}
          {privacyType === 'restricted' && 'Requires approval to post'}
          {privacyType === 'private' && 'Invite-only hub'}
        </p>
      </div>

      {/* NSFW Toggle */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-4">
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              NSFW (18+)
              {!isHubOwnerOrAdmin && (
                <span className="ml-2 text-xs text-[var(--color-text-secondary)]">(Owner only)</span>
              )}
            </label>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Mark this hub as NSFW (Not Safe For Work). NSFW hubs are hidden from default feeds and
              search results unless users explicitly opt-in. Content must be 18+ appropriate.
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
            <span className="sr-only">Toggle NSFW status</span>
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
        {saveError && (
          <div className="mr-4 p-2 text-sm text-red-600">{saveError}</div>
        )}
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="px-6 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
