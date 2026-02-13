import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  HubSettings,
  UpdateHubSettingsRequest,
  SpamFilterStrength,
} from '../../types/hubSettings';

interface Props {
  settings: HubSettings;
  onSave: (data: UpdateHubSettingsRequest) => void;
}

export default function ModerationSettingsTab({ settings, onSave }: Props) {
  const { t } = useTranslation();
  const initialBannedWords = (settings.banned_words ?? []).join(', ');
  const [bannedWords, setBannedWords] = useState(initialBannedWords);
  const [spamFilterStrength, setSpamFilterStrength] = useState<SpamFilterStrength>(
    settings.spam_filter_strength
  );
  const [newAccountFilterDays, setNewAccountFilterDays] = useState(
    (settings.new_account_filter_days ?? 0).toString()
  );
  const [minAccountKarma, setMinAccountKarma] = useState(
    (settings.min_account_karma ?? 0).toString()
  );
  const [accessRequestCooldownDays, setAccessRequestCooldownDays] = useState(
    (settings.access_request_cooldown_days ?? 0).toString()
  );

  const handleSave = () => {
    const bannedWordsArray = bannedWords
      .split(',')
      .map((word) => word.trim())
      .filter((word) => word.length > 0);

    onSave({
      ...settings,
      banned_words: bannedWordsArray,
      spam_filter_strength: spamFilterStrength,
      new_account_filter_days: parseInt(newAccountFilterDays) || 0,
      min_account_karma: parseInt(minAccountKarma) || 0,
      access_request_cooldown_days: parseInt(accessRequestCooldownDays) || 0,
    });
  };

  const hasChanges =
    bannedWords !== initialBannedWords ||
    spamFilterStrength !== settings.spam_filter_strength ||
    newAccountFilterDays !== (settings.new_account_filter_days ?? 0).toString() ||
    minAccountKarma !== (settings.min_account_karma ?? 0).toString() ||
    accessRequestCooldownDays !== (settings.access_request_cooldown_days ?? 0).toString();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">
          {t('hubSettings.moderation.title')}
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-6">
          {t('hubSettings.moderation.subtitle')}
        </p>
      </div>

      {/* Spam Filter */}
      <div>
        <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          {t('hubSettings.moderation.spamFilter.label')}
        </label>
        <select
          value={spamFilterStrength}
          onChange={(e) => setSpamFilterStrength(e.target.value as SpamFilterStrength)}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="low">{t('hubSettings.moderation.spamFilter.options.low')}</option>
          <option value="medium">{t('hubSettings.moderation.spamFilter.options.medium')}</option>
          <option value="high">{t('hubSettings.moderation.spamFilter.options.high')}</option>
        </select>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          {t('hubSettings.moderation.spamFilter.helper')}
        </p>
      </div>

      {/* Banned Words */}
      <div>
        <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          {t('hubSettings.moderation.bannedWords.label')}
        </label>
        <textarea
          value={bannedWords}
          onChange={(e) => setBannedWords(e.target.value)}
          placeholder={t('hubSettings.moderation.bannedWords.placeholder')}
          rows={4}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono text-sm"
        />
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          {t('hubSettings.moderation.bannedWords.helper')}
        </p>
      </div>

      {/* Account Age Filter */}
      <div>
        <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          {t('hubSettings.moderation.accountAge.label')}
        </label>
        <input
          type="number"
          value={newAccountFilterDays}
          onChange={(e) => setNewAccountFilterDays(e.target.value)}
          min="0"
          placeholder="0"
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          {t('hubSettings.moderation.accountAge.helper')}
        </p>
      </div>

      {/* Minimum Karma */}
      <div>
        <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          {t('hubSettings.moderation.karma.label')}
        </label>
        <input
          type="number"
          value={minAccountKarma}
          onChange={(e) => setMinAccountKarma(e.target.value)}
          min="0"
          placeholder="0"
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          {t('hubSettings.moderation.karma.helper')}
        </p>
      </div>

      {/* Access Request Cooldown - SETTINGS-4: Improved clarity and validation */}
      <div>
        <label htmlFor="access-cooldown" className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          {t('hubSettings.moderation.accessCooldown.label')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="access-cooldown"
            type="number"
            value={accessRequestCooldownDays}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              // Clamp between 0 and 365
              if (!isNaN(val)) {
                setAccessRequestCooldownDays(Math.max(0, Math.min(365, val)).toString());
              } else {
                setAccessRequestCooldownDays(e.target.value); // Allow empty for typing
              }
            }}
            min="0"
            max="365"
            placeholder="0"
            className="w-32 px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <span className="text-sm text-[var(--color-text-secondary)]">
            {t('hubSettings.moderation.units.days')}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          {t('hubSettings.moderation.accessCooldown.helper')}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {t('hubSettings.moderation.accessCooldown.range')}
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded p-4">
        <h4 className="font-medium text-blue-900 mb-2">{t('hubSettings.moderation.info.title')}</h4>
        <p className="text-sm text-blue-800">
          {t('hubSettings.moderation.info.description')}
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-[var(--color-border)]">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="px-6 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {t('hubSettings.common.actions.saveChanges')}
        </button>
      </div>
    </div>
  );
}
