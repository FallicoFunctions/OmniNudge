export type OmniChatBillingOfferKind = 'credits' | 'subscription';
export type OmniChatBillingPlan = 'plus' | 'premium';

/** Raw billing offer fields owned by the server. Display copy is derived by the client. */
export interface OmniChatBillingOffer {
  id: string;
  kind: OmniChatBillingOfferKind;
  credits?: number;
  price_cents: number;
  currency: string;
  plan?: OmniChatBillingPlan;
  period_days?: number;
}

export interface OmniChatWallet {
  user_id: number;
  purchased_balance: number;
  subscription_balance: number;
  subscription_expires_at?: string;
  updated_at: string;
}

/**
 * The kinds the backend actually writes -- models/omnicredits.go, the
 * OmniCreditsUsage* constants. Each one needs a label under
 * omnichat.commerce.usage; the modal builds that key at runtime, so a member
 * with no label renders the key itself into the usage list.
 */
export type OmniChatCreditUsageKind = 'chat' | 'voice' | 'image' | 'video';

export interface OmniChatCreditUsageItem {
  id: number;
  entry_type: string;
  usage_kind?: OmniChatCreditUsageKind;
  purchased_delta: number;
  subscription_delta: number;
  created_at: string;
}

export interface OmniChatBillingCosts {
  voice: number;
  image: number;
  video: number;
}

export interface OmniChatBillingUsage {
  usage: OmniChatCreditUsageItem[];
  costs: OmniChatBillingCosts;
  limit: number;
}

export interface OmniChatVideoEntitlement {
  allowed: boolean;
  credit_cost: number;
  unit: 'per_session';
}

export interface OmniChatCheckoutResponse {
  checkout_url: string;
}
