import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save } from 'lucide-react';
import { Modal } from '../common/Modal';
import type { ConversationSettings } from '../../types/omnichat';

export default function OmniChatDefaultsModal({
  isOpen,
  onClose,
  defaults,
  onSave,
  isSaving = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  defaults: ConversationSettings;
  onSave: (settings: ConversationSettings) => Promise<void> | void;
  isSaving?: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(defaults.user_name);
  const [age, setAge] = useState(defaults.user_age);
  const [gender, setGender] = useState(defaults.user_gender);

  useEffect(() => {
    if (!isOpen) return;
    setName(defaults.user_name);
    setAge(defaults.user_age);
    setGender(defaults.user_gender);
  }, [isOpen, defaults]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick
      className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#17171c] p-0 shadow-2xl"
      overlayClassName="bg-black/65 flex items-center justify-center"
    >
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-semibold text-white">{t('omnichat.header.defaults')}</h2>
        <p className="mt-1 text-sm text-white/55">{t('omnichat.header.defaultsDescription')}</p>
      </div>

      <div className="space-y-4 px-6 py-5">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white/70">
            {t('omnichat.chat.settingsName')}
          </span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white/70">
            {t('omnichat.chat.settingsAge')}
          </span>
          <input
            type="text"
            value={age}
            onChange={(event) => setAge(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white/70">
            {t('omnichat.chat.settingsGender')}
          </span>
          <select
            value={gender}
            onChange={(event) => setGender(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
          >
            <option value="">{t('omnichat.chat.settingsGenderN')}</option>
            <option value="M">{t('omnichat.chat.settingsGenderM')}</option>
            <option value="F">{t('omnichat.chat.settingsGenderF')}</option>
            <option value="T">{t('omnichat.chat.settingsGenderT')}</option>
            <option value="A">{t('omnichat.chat.settingsGenderA')}</option>
          </select>
        </label>

        <button
          type="button"
          disabled={isSaving}
          onClick={async () => {
            await onSave({ user_name: name, user_age: age, user_gender: gender });
            onClose();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {t('omnichat.header.saveDefaults')}
        </button>
      </div>
    </Modal>
  );
}
