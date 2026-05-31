import { api } from '../lib/api';
import type {
  Coin,
  CryptoPaymentStatusResponse,
  SubmitPaymentRequest,
  SubmitPaymentResponse,
} from '../types/payments';

const COINGECKO_IDS: Record<Coin, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  CAH: 'moon-tropica-cah',
};

export const paymentsService = {
  submitCryptoPayment(req: SubmitPaymentRequest): Promise<SubmitPaymentResponse> {
    return api.post<SubmitPaymentResponse>('/payments/crypto/submit', req);
  },

  getPaymentStatus(txid: string, coin: Coin): Promise<CryptoPaymentStatusResponse> {
    return api.get<CryptoPaymentStatusResponse>(
      `/payments/crypto/${encodeURIComponent(txid)}/status?coin=${coin}`
    );
  },

  /** Fetch live USD price for a coin from CoinGecko (public, no key needed). */
  async getCoinUSDPrice(coin: Coin): Promise<number> {
    const id = COINGECKO_IDS[coin];
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
    const data: Record<string, { usd: number }> = await res.json();
    const price = data[id]?.usd;
    if (!price) throw new Error(`No price for ${coin}`);
    return price;
  },
};
