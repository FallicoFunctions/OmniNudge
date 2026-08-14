import { ArrowLeft, Check, Gauge, Layers3, LockKeyhole, MessageCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import type {
  OmniChatAccountTier,
  OmniChatModelKey,
  OmniChatModelScope,
} from '../../types/omnichat';
import { OMNICHAT_MODEL_LABELS } from '../../utils/omnichatModelProfiles';

type Props = {
  isOpen: boolean;
  accountTier: OmniChatAccountTier;
  currentModelKey: OmniChatModelKey;
  isGuest: boolean;
  isSaving?: boolean;
  error?: string;
  onClose: () => void;
  onApply: (model: OmniChatModelKey, scope: OmniChatModelScope) => void;
  onRequestAuth: () => void;
  onRequestUpgrade: (tier: 'plus' | 'premium') => void;
};

const MODELS: Array<{
  key: OmniChatModelKey;
  label: string;
  eyebrow: string;
  description: string;
  note: string;
  requiredTier: OmniChatAccountTier;
}> = [
  {
    key: 'standard',
    label: OMNICHAT_MODEL_LABELS.standard,
    eyebrow: 'Everyday',
    description: 'General-purpose conversation for casual chats and exploring characters.',
    note: 'Included for everyone',
    requiredTier: 'free',
  },
  {
    key: 'plus',
    label: OMNICHAT_MODEL_LABELS.plus,
    eyebrow: 'Returning chats',
    description: 'A Plus profile for conversations you return to.',
    note: 'Requires Plus',
    requiredTier: 'plus',
  },
  {
    key: 'premium_quick',
    label: OMNICHAT_MODEL_LABELS.premium_quick,
    eyebrow: 'Premium',
    description: 'A Premium profile configured for natural back-and-forth.',
    note: 'Requires Premium',
    requiredTier: 'premium',
  },
  {
    key: 'premium_deep',
    label: OMNICHAT_MODEL_LABELS.premium_deep,
    eyebrow: 'Premium',
    description: 'A Premium profile configured for deliberate reasoning in complex scenes.',
    note: 'Requires Premium',
    requiredTier: 'premium',
  },
  {
    key: 'ultra_fast',
    label: OMNICHAT_MODEL_LABELS.ultra_fast,
    eyebrow: 'Complex reasoning',
    description: 'Advanced reasoning for complex character and scene continuity.',
    note: 'Premium · Uses 2 OmniCredits per response',
    requiredTier: 'premium',
  },
];

const tierRank: Record<OmniChatAccountTier, number> = { free: 0, plus: 1, premium: 2 };

export default function OmniChatModelSelectorModal({
  isOpen,
  accountTier,
  currentModelKey,
  isGuest,
  isSaving = false,
  error,
  onClose,
  onApply,
  onRequestAuth,
  onRequestUpgrade,
}: Props) {
  const [pendingModel, setPendingModel] = useState<OmniChatModelKey | null>(null);

  useEffect(() => {
    if (!isOpen) setPendingModel(null);
  }, [isOpen]);

  const chooseModel = (model: OmniChatModelKey) => {
    const definition = MODELS.find(({ key }) => key === model);
    if (!definition) return;
    if (isGuest) {
      onRequestAuth();
      return;
    }
    const requiredTier = definition.requiredTier;
    if (tierRank[requiredTier] > tierRank[accountTier]) {
      onRequestUpgrade(requiredTier as 'plus' | 'premium');
      return;
    }
    setPendingModel(model);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSaving ? undefined : onClose}
      overlayClassName="bg-black/75 backdrop-blur-md"
      className="w-full max-w-3xl overflow-hidden rounded-t-[30px] border border-white/10 bg-[#11131b] shadow-[0_32px_100px_rgba(0,0,0,.65)] sm:rounded-[30px]"
      ariaLabelledBy="omnichat-model-title"
      ariaDescribedBy="omnichat-model-description"
      animation="quick-chat"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex items-start justify-between border-b border-white/10 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            {pendingModel && (
              <button
                type="button"
                aria-label="Back to models"
                onClick={() => setPendingModel(null)}
                className="omnichat-touch-target -ml-2 flex items-center justify-center rounded-full text-white/65 hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft size={19} />
              </button>
            )}
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[#7da8ff]">
                Conversation model
              </p>
              <h2
                id="omnichat-model-title"
                className="text-2xl font-semibold tracking-tight text-white"
              >
                {pendingModel
                  ? `Use ${MODELS.find((model) => model.key === pendingModel)?.label} where?`
                  : 'Choose how this chat thinks'}
              </h2>
              <p id="omnichat-model-description" className="mt-1 text-sm text-white/55">
                {pendingModel
                  ? 'You can keep this choice local or make it your default everywhere.'
                  : 'Switch at any time. Your character and conversation history stay the same.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close model selector"
            onClick={onClose}
            disabled={isSaving}
            className="omnichat-touch-target flex shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-7">
          {!pendingModel ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MODELS.map((model) => {
                const locked = !isGuest && tierRank[model.requiredTier] > tierRank[accountTier];
                const current = model.key === currentModelKey;
                return (
                  <button
                    key={model.key}
                    type="button"
                    aria-label={`Select ${model.label}`}
                    onClick={() => chooseModel(model.key)}
                    className={`group relative min-h-52 rounded-[22px] border p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#5d8fff]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5d8fff] ${
                      current
                        ? 'border-[#5d8fff] bg-[#315ca8]/20 shadow-[0_16px_55px_rgba(50,100,210,.14)]'
                        : 'border-white/10 bg-white/[0.035]'
                    }`}
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/60">
                        {model.eyebrow}
                      </span>
                      {current ? (
                        <Check size={18} className="text-[#7da8ff]" />
                      ) : locked ? (
                        <LockKeyhole size={17} className="text-white/40" />
                      ) : (
                        <MessageCircle size={17} className="text-white/35" />
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-white">{model.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">{model.description}</p>
                    <p className="mt-5 text-xs font-semibold text-white/40">{model.note}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onApply(pendingModel, 'this_chat')}
                disabled={isSaving}
                className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 text-left transition hover:border-[#5d8fff]/70 hover:bg-[#315ca8]/15 disabled:opacity-50"
              >
                <Gauge className="mb-7 text-[#7da8ff]" size={24} />
                <span className="block text-lg font-semibold text-white">Only this chat</span>
                <span className="mt-2 block text-sm leading-6 text-white/55">
                  Use it here. Your other chats keep their current model.
                </span>
              </button>
              <button
                type="button"
                onClick={() => onApply(pendingModel, 'all_chats')}
                disabled={isSaving}
                className="rounded-[24px] border border-[#5d8fff]/55 bg-[#315ca8]/18 p-6 text-left transition hover:border-[#7da8ff] hover:bg-[#315ca8]/25 disabled:opacity-50"
              >
                <Layers3 className="mb-7 text-[#7da8ff]" size={24} />
                <span className="block text-lg font-semibold text-white">All chats</span>
                <span className="mt-2 block text-sm leading-6 text-white/55">
                  Make it your default and update every existing chat.
                </span>
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
