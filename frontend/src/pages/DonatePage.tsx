import { useState } from 'react';
import { PageShell } from '../components/common/PageShell';
import btcIcon from 'cryptocurrency-icons/svg/color/btc.svg';
import ethIcon from 'cryptocurrency-icons/svg/color/eth.svg';
import cahIcon from '/cah-logo.png';

interface Wallet {
  name: string;
  ticker: string;
  address: string;
  logo: string;
}

const WALLETS: Wallet[] = [
  {
    name: 'Bitcoin',
    ticker: 'BTC',
    address: '31yyvq2asepMEJLqtuka7oSoVCRrnoeG2K',
    logo: btcIcon,
  },
  {
    name: 'Ethereum',
    ticker: 'ETH',
    address: '0xc308f275a03bad6c3ba3b75e2d024d258cba586f',
    logo: ethIcon,
  },
  {
    name: 'Moon Tropica',
    ticker: 'CAH',
    address: '0xc308f275a03bad6c3ba3b75e2d024d258cba586f',
    logo: cahIcon,
  },
];

function WalletCard({ wallet }: { wallet: Wallet }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center gap-3 mb-4">
        <img src={wallet.logo} alt={wallet.name} className="w-8 h-8 shrink-0" />
        <div>
          <h2 className="text-h3 font-semibold text-[var(--color-text-primary)]">{wallet.name}</h2>
          <span className="text-small text-[var(--color-text-secondary)]">{wallet.ticker}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--color-text-primary)] break-all">
          {wallet.address}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${wallet.ticker} address`}
          className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function DonatePage() {
  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-display font-bold text-[var(--color-text-primary)] mb-3">
            Support OmniNudge
          </h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            OmniNudge is independently built and operated with no ads and no data selling.
            If you find value in it, a crypto donation helps keep the servers running.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {WALLETS.map((wallet) => (
            <WalletCard key={wallet.ticker} wallet={wallet} />
          ))}
        </div>

        <p className="mt-8 text-center text-small text-[var(--color-text-muted)]">
          Thank you for your support.
        </p>
      </div>
    </PageShell>
  );
}
