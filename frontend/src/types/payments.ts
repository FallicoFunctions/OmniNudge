export type Coin = 'BTC' | 'ETH' | 'CAH';
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'insufficient';

export interface CryptoPaymentStatusResponse {
  payment_id: number;
  status: PaymentStatus;
  confirmations: number;
  coin: Coin;
  usd_value: number;
  plan_months: number;
  created_at: string;
  confirmed_at: string | null;
}

export interface SubmitPaymentRequest {
  txid: string;
  coin: Coin;
  plan_months: number;
}

export interface SubmitPaymentResponse {
  status: 'confirmed' | 'pending';
  payment_id: number;
  confirmations?: number;
  message: string;
}

export interface CoinMeta {
  ticker: Coin;
  name: string;
  usdPricePerMonth: number;
  walletAddress: string;
  color: string;
}

export const COIN_META: Record<Coin, CoinMeta> = {
  BTC: {
    ticker: 'BTC',
    name: 'Bitcoin',
    usdPricePerMonth: 2.99,
    walletAddress: '31yyvq2asepMEJLqtuka7oSoVCRrnoeG2K',
    color: '#f7931a',
  },
  ETH: {
    ticker: 'ETH',
    name: 'Ethereum',
    usdPricePerMonth: 2.99,
    walletAddress: '0xc308f275a03bad6c3ba3b75e2d024d258cba586f',
    color: '#627eea',
  },
  CAH: {
    ticker: 'CAH',
    name: 'Moon Tropica',
    usdPricePerMonth: 1.99,
    walletAddress: '0xc308f275a03bad6c3ba3b75e2d024d258cba586f',
    color: '#7c3aed',
  },
};
