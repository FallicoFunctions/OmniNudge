import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Coins, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { omnichatQueryKeys, omnichatService } from '../../services/omnichatService';
import OmniChatCommerceModal from './OmniChatCommerceModal';

// Spending happens on the server and nothing pushes it here, so the balance
// is re-read now and then as well as whenever the window regains focus.
const WALLET_REFRESH_MS = 30_000;

export default function OmniChatCreditsMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';

  const walletQuery = useQuery({
    queryKey: omnichatQueryKeys.billingWallet,
    queryFn: () => omnichatService.getBillingWallet(),
    refetchInterval: WALLET_REFRESH_MS,
  });
  const usageQuery = useQuery({
    queryKey: omnichatQueryKeys.billingUsage(),
    queryFn: () => omnichatService.getBillingUsage(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const wallet = walletQuery.data;
  const balance = wallet
    ? (wallet.purchased_balance + wallet.subscription_balance).toLocaleString(locale)
    : '…';
  const costs = usageQuery.data?.costs;
  const prices = costs
    ? [
        { kind: 'voice', label: t('omnichat.commerce.usage.voice'), price: String(costs.voice) },
        { kind: 'image', label: t('omnichat.commerce.usage.image'), price: String(costs.image) },
        { kind: 'video', label: t('omnichat.commerce.usage.video'), price: String(costs.video) },
        {
          kind: 'call_minute',
          label: t('omnichat.commerce.usage.call_minute'),
          price: t('omnichat.header.credits.perMinute', { cost: costs.call_minute }),
        },
      ]
    : [];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        // Read aloud, the placeholder would be "dot dot dot OmniCredits".
        aria-label={
          wallet
            ? t('omnichat.header.credits.balance', { balance })
            : t('omnichat.header.credits.loading')
        }
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="omnichat-touch-target flex items-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.055] px-3 text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition hover:border-white/20 hover:bg-white/10"
      >
        <Coins size={18} aria-hidden="true" className="text-amber-300" />
        <span className="text-sm font-semibold tabular-nums">{balance}</span>
        {/* A phone's header has no room for it beside the account menu and a call. */}
        <ChevronDown size={16} aria-hidden="true" className="hidden text-white/50 sm:block" />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+12px)] w-64 rounded-3xl border border-white/10 bg-[#191920] p-4 shadow-2xl"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-white/45">
            {t('omnichat.header.credits.prices')}
          </p>
          <dl className="mt-2 divide-y divide-white/10">
            {prices.map((row) => (
              <div key={row.kind} className="flex items-center justify-between py-2.5 text-sm">
                <dt className="text-white/80">{row.label}</dt>
                <dd className="flex items-center gap-1.5 font-semibold text-white">
                  {row.price}
                  <Coins size={14} aria-hidden="true" className="text-amber-300" />
                </dd>
              </div>
            ))}
          </dl>
          {usageQuery.isLoading && <p className="py-2 text-sm text-white/45">…</p>}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setBuying(true);
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {t('omnichat.header.credits.buyMore')}
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <OmniChatCommerceModal isOpen={buying} onClose={() => setBuying(false)} />
    </div>
  );
}
