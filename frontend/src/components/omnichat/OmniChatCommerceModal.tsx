import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Coins, Crown, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  createOmniChatCheckoutIdempotencyId,
  isSafeOmniChatCheckoutURL,
  omnichatQueryKeys,
  omnichatService,
} from '../../services/omnichatService';
import type { OmniChatBillingOffer } from '../../types/omnichatCommerce';
import { Modal } from '../common/Modal';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (url: string) => void;
};

export function formatOmniChatOfferPrice(offer: OmniChatBillingOffer, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: offer.currency,
    }).format(offer.price_cents / 100);
  } catch {
    return `${offer.price_cents / 100} ${offer.currency}`;
  }
}

export default function OmniChatCommerceModal({
  isOpen,
  onClose,
  onNavigate = (url) => window.location.assign(url),
}: Props) {
  const { t, i18n } = useTranslation();
  const [checkoutError, setCheckoutError] = useState('');
  const checkoutIdempotencyIds = useRef(new Map<string, string>());
  const catalogQuery = useQuery({
    queryKey: omnichatQueryKeys.billingCatalog,
    queryFn: () => omnichatService.getBillingCatalog(),
    enabled: isOpen,
  });
  const walletQuery = useQuery({
    queryKey: omnichatQueryKeys.billingWallet,
    queryFn: () => omnichatService.getBillingWallet(),
    enabled: isOpen,
  });
  const usageQuery = useQuery({
    queryKey: omnichatQueryKeys.billingUsage(),
    queryFn: () => omnichatService.getBillingUsage(),
    enabled: isOpen,
  });
  const checkoutMutation = useMutation({
    mutationFn: async (offerId: string) => {
      let idempotencyId = checkoutIdempotencyIds.current.get(offerId);
      if (!idempotencyId) {
        idempotencyId = createOmniChatCheckoutIdempotencyId();
        checkoutIdempotencyIds.current.set(offerId, idempotencyId);
      }
      const result = await omnichatService.createBillingCheckout(offerId, idempotencyId);
      if (!isSafeOmniChatCheckoutURL(result.checkout_url)) {
        throw new Error('unsafe_checkout_url');
      }
      return { offerId, url: result.checkout_url };
    },
    onMutate: () => setCheckoutError(''),
    onSuccess: ({ offerId, url }) => {
      checkoutIdempotencyIds.current.delete(offerId);
      onNavigate(url);
    },
    onError: () => setCheckoutError(t('omnichat.commerce.errors.secureCheckout')),
  });

  const offers = catalogQuery.data ?? [];
  const planOffers = offers.filter((offer) => offer.kind === 'subscription');
  const creditPacks = offers.filter((offer) => offer.kind === 'credits');
  const wallet = walletQuery.data;
  const usage = usageQuery.data?.usage ?? [];
  const totalBalance = (wallet?.purchased_balance ?? 0) + (wallet?.subscription_balance ?? 0);
  const isLoading = catalogQuery.isLoading || walletQuery.isLoading || usageQuery.isLoading;
  const loadError = catalogQuery.isError || walletQuery.isError || usageQuery.isError;
  const error = checkoutError || (loadError ? t('omnichat.commerce.errors.load') : '');
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const descriptionId = 'omnichat-commerce-description';
  const statusId = 'omnichat-commerce-status';

  const planFeatureKeys = useMemo(
    () => ({
      plus: ['profiles', 'media'],
      premium: ['profiles', 'media', 'priority'],
    }),
    []
  );

  const offerName = (offer: OmniChatBillingOffer) =>
    offer.kind === 'credits'
      ? t('omnichat.commerce.creditName', { count: offer.credits ?? 0 })
      : t(`omnichat.commerce.offerNames.${offer.plan ?? 'unknown'}`);

  const periodLabel = (offer: OmniChatBillingOffer) =>
    offer.period_days === 30
      ? t('omnichat.commerce.period.month')
      : t('omnichat.commerce.period.days', { count: offer.period_days ?? 0 });

  return (
    <Modal
      isOpen={isOpen}
      onClose={checkoutMutation.isPending ? undefined : onClose}
      ariaLabelledBy="omnichat-commerce-title"
      ariaDescribedBy={`${descriptionId} ${statusId}`}
      overlayClassName="bg-black/80 backdrop-blur-md"
      className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#11131b] text-white shadow-2xl"
      animation="quick-chat"
    >
      <div
        className="flex max-h-[92dvh] flex-col"
        aria-busy={isLoading || checkoutMutation.isPending}
      >
        <header className="flex items-start justify-between border-b border-white/10 p-5 sm:p-7">
          <div>
            <h2 id="omnichat-commerce-title" className="text-2xl font-semibold">
              {t('omnichat.commerce.title')}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-white/55">
              {t('omnichat.commerce.subtitle')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            disabled={checkoutMutation.isPending}
            className="rounded-full p-2 text-white/55 hover:bg-white/10 disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-7">
          <p id={statusId} aria-live="polite" className="sr-only">
            {isLoading
              ? t('omnichat.commerce.loading')
              : checkoutMutation.isPending
                ? t('omnichat.commerce.redirecting')
                : ''}
          </p>

          <section
            aria-labelledby="wallet-title"
            className="rounded-2xl border border-blue-300/20 bg-blue-500/10 p-5"
          >
            <div className="flex items-center gap-2">
              <Coins className="text-blue-300" />
              <h3 id="wallet-title" className="font-semibold">
                {t('omnichat.commerce.wallet')}
              </h3>
            </div>
            <p className="mt-3 text-3xl font-bold">
              {totalBalance.toLocaleString(locale)}{' '}
              <span className="text-sm font-medium text-white/55">OmniCredits</span>
            </p>
            {wallet && (
              <p className="mt-1 text-xs text-white/45">
                {t('omnichat.commerce.balanceBreakdown', {
                  purchased: wallet.purchased_balance,
                  subscription: wallet.subscription_balance,
                })}
              </p>
            )}
          </section>

          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 aria-hidden="true" className="animate-spin text-blue-300" />
            </div>
          ) : offers.length === 0 && !loadError ? (
            <p className="mt-5 rounded-2xl border border-white/10 p-5 text-sm text-white/60">
              {t('omnichat.commerce.notConfigured')}
            </p>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section aria-labelledby="plans-title">
                <h3 id="plans-title" className="font-semibold">
                  {t('omnichat.commerce.plans')}
                </h3>
                <div className="mt-3 space-y-3">
                  {planOffers.map((offer) => {
                    const name = offerName(offer);
                    const featureKeys =
                      planFeatureKeys[offer.plan as keyof typeof planFeatureKeys] ?? [];
                    return (
                      <article key={offer.id} className="rounded-2xl border border-white/10 p-4">
                        <div className="flex items-center gap-2">
                          <Crown size={17} className="text-blue-300" />
                          <h4 className="font-semibold">{name}</h4>
                          <span className="ms-auto text-sm font-semibold">
                            {formatOmniChatOfferPrice(offer, locale)}/{periodLabel(offer)}
                          </span>
                        </div>
                        <ul className="mt-3 space-y-1 text-sm text-white/55">
                          {featureKeys.map((key) => (
                            <li key={key}>✓ {t(`omnichat.commerce.features.${key}`)}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          disabled={checkoutMutation.isPending}
                          onClick={() => checkoutMutation.mutate(offer.id)}
                          className="mt-4 w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-40"
                        >
                          {t('omnichat.commerce.choosePlan', { plan: name })}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="credits-title">
                <h3 id="credits-title" className="font-semibold">
                  {t('omnichat.commerce.creditPacks')}
                </h3>
                <div className="mt-3 space-y-3">
                  {creditPacks.map((offer) => {
                    const name = offerName(offer);
                    return (
                      <article
                        key={offer.id}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 p-4"
                      >
                        <div>
                          <h4 className="font-semibold">{name}</h4>
                          <p className="text-sm text-white/50">
                            {formatOmniChatOfferPrice(offer, locale)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={checkoutMutation.isPending}
                          onClick={() => checkoutMutation.mutate(offer.id)}
                          className="ms-auto rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-40"
                        >
                          {t('omnichat.commerce.buyPack', { pack: name })}
                        </button>
                      </article>
                    );
                  })}
                </div>
                <h3 className="mt-5 font-semibold">{t('omnichat.commerce.recentUsage')}</h3>
                {usage.length ? (
                  <ul className="mt-2 divide-y divide-white/10">
                    {usage.slice(0, 10).map((item) => {
                      const delta = item.purchased_delta + item.subscription_delta;
                      return (
                        <li key={item.id} className="flex justify-between py-2 text-sm">
                          <span>{t(`omnichat.commerce.usage.${item.usage_kind ?? 'other'}`)}</span>
                          <span className="text-white/55">
                            {delta > 0 ? '+' : ''}
                            {delta.toLocaleString(locale)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-white/45">{t('omnichat.commerce.noUsage')}</p>
                )}
              </section>
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
