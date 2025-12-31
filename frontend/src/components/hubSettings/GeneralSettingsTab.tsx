import { useState } from 'react';
import type { HubSettings, UpdateHubSettingsRequest, PrivacyType } from '../../types/hubSettings';

interface Props {
  settings: HubSettings;
  onSave: (data: UpdateHubSettingsRequest) => void;
  isOwner: boolean;
}

export default function GeneralSettingsTab({ settings, onSave, isOwner }: Props) {
  const [displayTitle, setDisplayTitle] = useState(settings.display_title || '');
  const [sidebarMarkdown, setSidebarMarkdown] = useState(settings.sidebar_markdown || '');
  const [privacyType, setPrivacyType] = useState<PrivacyType>(settings.privacy_type);

  const handleSave = () => {
    onSave({
      ...settings,
      display_title: displayTitle || undefined,
      sidebar_markdown: sidebarMarkdown || undefined,
      privacy_type: privacyType,
    });
  };

  const hasChanges =
    displayTitle !== (settings.display_title || '') ||
    sidebarMarkdown !== (settings.sidebar_markdown || '') ||
    privacyType !== settings.privacy_type;

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
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          Sidebar Description
        </label>
        <textarea
          value={sidebarMarkdown}
          onChange={(e) => setSidebarMarkdown(e.target.value)}
          placeholder="Markdown supported..."
          rows={8}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono text-sm"
        />
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          Displayed in the hub sidebar. Supports Markdown formatting.
        </p>
      </div>

      {/* Privacy Type */}
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          Hub Privacy
          {!isOwner && (
            <span className="ml-2 text-xs text-[var(--color-text-secondary)]">(Owner only)</span>
          )}
        </label>
        <select
          value={privacyType}
          onChange={(e) => setPrivacyType(e.target.value as PrivacyType)}
          disabled={!isOwner}
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

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-[var(--color-border)]">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="px-6 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
