import { useState, useEffect, useCallback, useRef } from 'react';
import { paymentsService } from '../../services/paymentsService';
import { COIN_META } from '../../types/payments';
import type { Coin } from '../../types/payments';
import { useAuth } from '../../contexts/AuthContext';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgraded: () => void;
}

type ModalStep = 'plan' | 'payment' | 'pending' | 'success';

const COINS: Coin[] = ['BTC', 'ETH', 'CAH'];

function CoinIcon({ coin, size = 24 }: { coin: Coin; size?: number }) {
  const meta = COIN_META[coin];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: meta.color, fontSize: size * 0.35 }}
    >
      {coin[0]}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded px-2 py-1 text-xs font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function UpgradeModal({ isOpen, onClose, onUpgraded }: UpgradeModalProps) {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<ModalStep>('plan');
  const [selectedCoin, setSelectedCoin] = useState<Coin>('BTC');
  const [txid, setTxid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<number | null>(null);
  const [confirmations, setConfirmations] = useState(0);
  const [coinPrice, setCoinPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const meta = COIN_META[selectedCoin];
  const cryptoAmount = coinPrice ? meta.usdPricePerMonth / coinPrice : null;

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handleUpgradeSuccess = useCallback(async () => {
    stopPolling();
    await refreshUser();
    setStep('success');
    onUpgraded();
  }, [stopPolling, refreshUser, onUpgraded]);

  // Fetch live coin price when coin changes and we're on payment step
  useEffect(() => {
    if (step !== 'payment') return;
    let cancelled = false;
    setPriceLoading(true);
    setCoinPrice(null);
    paymentsService
      .getCoinUSDPrice(selectedCoin)
      .then((price) => {
        if (!cancelled) setCoinPrice(price);
      })
      .catch(() => {
        /* non-fatal — price display is best-effort */
      })
      .finally(() => {
        if (!cancelled) setPriceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCoin, step]);

  // Poll pending payment status
  useEffect(() => {
    if (step !== 'pending' || pendingPaymentId === null) return;

    const poll = async () => {
      try {
        const status = await paymentsService.getPaymentStatus(txid, selectedCoin);
        setConfirmations(status.confirmations);
        if (status.status === 'confirmed') {
          await handleUpgradeSuccess();
        } else if (status.status === 'failed' || status.status === 'insufficient') {
          stopPolling();
          setError(
            status.status === 'insufficient'
              ? 'Payment amount was insufficient for the selected plan.'
              : 'Transaction could not be confirmed. Please contact support.'
          );
          setStep('payment');
        }
      } catch {
        // Network blip — keep polling
      }
    };

    pollingRef.current = setInterval(poll, 30_000);
    poll(); // Run immediately
    return stopPolling;
  }, [step, pendingPaymentId, txid, selectedCoin, handleUpgradeSuccess, stopPolling]);

  // Cleanup on unmount / close
  useEffect(() => {
    if (!isOpen) {
      stopPolling();
    }
  }, [isOpen, stopPolling]);

  const handleClose = () => {
    stopPolling();
    setStep('plan');
    setTxid('');
    setError(null);
    setPendingPaymentId(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txid.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await paymentsService.submitCryptoPayment({
        txid: txid.trim(),
        coin: selectedCoin,
        plan_months: 1,
      });
      if (res.status === 'confirmed') {
        await handleUpgradeSuccess();
      } else {
        setPendingPaymentId(res.payment_id);
        setConfirmations(res.confirmations ?? 0);
        setStep('pending');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to submit payment. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-h3 font-semibold text-[var(--color-text-primary)]">
            {step === 'success' ? 'Plan upgraded!' : 'Upgrade to Paid'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {/* STEP: Plan overview */}
          {step === 'plan' && (
            <div className="space-y-4">
              <p className="text-small text-[var(--color-text-secondary)]">
                OmniNudge has no ads and sells no data. The paid plan keeps the servers running.
              </p>

              {/* Plan comparison */}
              <div className="grid grid-cols-2 gap-3">
                {/* Free */}
                <div className="rounded-lg border border-[var(--color-border)] p-4">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                    Free
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mb-3">Always free</p>
                  <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
                    <li>✓ Encrypted messaging</li>
                    <li>✓ Image sharing (10 MB/file)</li>
                    <li>✗ Video calling</li>
                    <li>✗ Voice calling</li>
                    <li>✗ Large file transfers</li>
                  </ul>
                </div>
                {/* Paid */}
                <div className="rounded-lg border-2 border-[var(--color-primary)] p-4 relative">
                  <span className="absolute -top-2.5 left-3 bg-[var(--color-primary)] text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    Paid
                  </span>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                    From <span className="text-[var(--color-primary)]">$1.99</span>/mo
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mb-3">Crypto only</p>
                  <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
                    <li>✓ Everything in free</li>
                    <li>✓ Video calling</li>
                    <li>✓ Voice calling</li>
                    <li>✓ Large file transfers</li>
                    <li>✓ Priority support</li>
                  </ul>
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-muted)] text-center">
                No recurring charges — renew manually when your month ends.
              </p>

              <button
                type="button"
                onClick={() => setStep('payment')}
                className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Pay with Crypto
              </button>
            </div>
          )}

          {/* STEP: Payment */}
          {step === 'payment' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Coin selector */}
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                  Select coin
                </p>
                <div className="flex gap-2">
                  {COINS.map((coin) => (
                    <button
                      key={coin}
                      type="button"
                      onClick={() => setSelectedCoin(coin)}
                      className={`flex-1 flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-semibold transition-colors ${
                        selectedCoin === coin
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50'
                      }`}
                    >
                      <CoinIcon coin={coin} size={28} />
                      <span>{coin}</span>
                      <span className="font-normal text-[var(--color-text-muted)]">
                        ${COIN_META[coin].usdPricePerMonth}/mo
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Send to address */}
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                  Send exactly{' '}
                  <span className="text-[var(--color-primary)]">${meta.usdPricePerMonth} USD</span>{' '}
                  worth of {meta.name} to:
                </p>
                {cryptoAmount && (
                  <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                    ≈ {cryptoAmount.toFixed(selectedCoin === 'BTC' ? 8 : 4)} {selectedCoin}
                    {priceLoading && ' (loading…)'}
                  </p>
                )}
                {!cryptoAmount && priceLoading && (
                  <p className="text-xs text-[var(--color-text-secondary)] mb-2">Loading price…</p>
                )}
                <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-elevated)] px-3 py-2">
                  <code className="flex-1 text-xs font-mono text-[var(--color-text-primary)] break-all">
                    {meta.walletAddress}
                  </code>
                  <CopyButton text={meta.walletAddress} />
                </div>
              </div>

              {/* TXID input */}
              <div>
                <label className="text-sm font-semibold text-[var(--color-text-primary)] mb-1 block">
                  Paste your transaction ID (TXID)
                </label>
                <input
                  type="text"
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  placeholder={selectedCoin === 'BTC' ? 'e.g. a1b2c3d4...' : 'e.g. 0x1234...'}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                  required
                />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Found in your wallet after sending. We verify it on-chain automatically.
                </p>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('plan');
                    setError(null);
                  }}
                  className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting || !txid.trim()}
                  className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {submitting ? 'Verifying…' : 'Verify Payment'}
                </button>
              </div>
            </form>
          )}

          {/* STEP: Pending */}
          {step === 'pending' && (
            <div className="space-y-4 text-center py-4">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Waiting for confirmations
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  {selectedCoin === 'BTC'
                    ? `${confirmations}/3 confirmations — BTC can take up to 30 min`
                    : `${confirmations}/12 confirmations — ETH typically takes a few minutes`}
                </p>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                This page updates automatically. You can close it and check back later — your plan
                will upgrade as soon as the transaction confirms.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors"
              >
                Close (upgrade happens automatically)
              </button>
            </div>
          )}

          {/* STEP: Success */}
          {step === 'success' && (
            <div className="space-y-4 text-center py-4">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  You're on the paid plan!
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Your account has been upgraded for 1 month.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Start using paid features
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
