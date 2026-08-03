import { Check, Crown, MessageCircle, X, Zap } from 'lucide-react';
import { Modal } from '../common/Modal';
import type { OmniChatAccountTier } from '../../types/omnichat';

type PaidTier = 'plus' | 'premium';
type Props = {
  isOpen: boolean;
  currentTier: OmniChatAccountTier;
  preferredTier?: PaidTier;
  onClose: () => void;
  onChoosePlan: (tier: PaidTier) => void;
};

const PLANS = [
  {
    key: 'free' as const,
    name: 'Standard',
    kicker: 'Start here',
    description: 'Access to the Standard profile for everyday chat.',
    features: [
      'Standard conversation profile',
      'Select Standard for any chat',
      'Core character memory',
    ],
  },
  {
    key: 'plus' as const,
    name: 'Plus',
    kicker: 'Profile access',
    description: 'Access to Standard and Plus conversation profiles.',
    features: [
      'Standard and Plus conversation profiles',
      'Choose Plus for a single chat',
      'Set Plus as your default for all chats',
    ],
  },
  {
    key: 'premium' as const,
    name: 'Premium',
    kicker: 'Expanded profile access',
    description: 'Access to Standard, Plus, Premium Quick, and Premium Deep.',
    features: [
      'Premium Quick and Premium Deep profiles',
      'Choose a profile per chat or set a default',
      'Advanced available with OmniCredits after launch',
    ],
  },
];

export default function OmniChatUpgradeModal({
  isOpen,
  currentTier,
  preferredTier,
  onClose,
  onChoosePlan,
}: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="bg-black/80 backdrop-blur-md"
      className="w-full max-w-5xl overflow-hidden rounded-t-[30px] border border-white/10 bg-[#0e1017] shadow-[0_32px_120px_rgba(0,0,0,.72)] sm:rounded-[30px]"
      ariaLabelledBy="omnichat-upgrade-title"
      ariaDescribedBy="omnichat-upgrade-description"
      animation="quick-chat"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="relative border-b border-white/10 px-5 py-6 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7da8ff]">
            OmniChat plans
          </p>
          <h2
            id="omnichat-upgrade-title"
            className="mt-1 max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-3xl"
          >
            Choose the conversation experience that fits you
          </h2>
          <p
            id="omnichat-upgrade-description"
            className="mt-2 max-w-2xl text-sm leading-6 text-white/55"
          >
            Compare profile access, reasoning modes, and included options.
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close plans"
            className="omnichat-touch-target absolute right-4 top-4 flex items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = currentTier === plan.key;
              const emphasized = preferredTier
                ? preferredTier === plan.key
                : plan.key === 'premium';
              return (
                <article
                  key={plan.key}
                  className={`relative rounded-[26px] border p-5 sm:p-6 ${emphasized ? 'border-[#5d8fff]/70 bg-[#315ca8]/14 shadow-[0_18px_70px_rgba(49,92,168,.16)]' : 'border-white/10 bg-white/[0.03]'}`}
                >
                  {plan.key === 'premium' && (
                    <span className="absolute right-4 top-4 rounded-full bg-[#426fc4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      Expanded access
                    </span>
                  )}
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.07] text-[#8eb1ff]">
                    {plan.key === 'free' ? (
                      <MessageCircle size={19} />
                    ) : plan.key === 'plus' ? (
                      <Zap size={19} />
                    ) : (
                      <Crown size={19} />
                    )}
                  </div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">
                    {plan.kicker}
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold text-white">{plan.name}</h3>
                  <p className="mt-3 min-h-12 text-sm leading-6 text-white/55">
                    {plan.description}
                  </p>
                  <p className="mt-5 text-sm font-semibold text-white/80">
                    View current pricing and included benefits
                  </p>
                  <ul className="mt-5 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-sm text-white/65">
                        <Check size={16} className="mt-0.5 shrink-0 text-[#7da8ff]" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {plan.key === 'free' ? (
                    <div
                      aria-current={isCurrent ? 'true' : undefined}
                      className="mt-7 flex min-h-11 items-center justify-center rounded-full border border-white/10 text-sm font-semibold text-white/45"
                    >
                      {isCurrent ? 'Current plan' : 'Included'}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onChoosePlan(plan.key)}
                      className="omnichat-touch-target mt-7 w-full rounded-full bg-[#426fc4] px-4 text-sm font-semibold text-white transition hover:bg-[#527fd3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7da8ff]"
                    >
                      Choose {plan.name}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <p className="mt-5 text-center text-xs leading-5 text-white/35">
            Switching plans never replaces your characters or conversation history. You can review
            current pricing before checkout.
          </p>
        </div>
      </div>
    </Modal>
  );
}
