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

export interface OmniChatCreditUsageItem {
  id: number;
  entry_type: string;
  usage_kind?: string;
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
