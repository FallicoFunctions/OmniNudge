import type { OmniChatModelKey } from '../types/omnichat';

export const OMNICHAT_MODEL_LABELS = {
  standard: 'Standard',
  plus: 'Plus',
  premium_quick: 'Premium Quick',
  premium_deep: 'Premium Deep',
} as const satisfies Record<OmniChatModelKey, string>;
