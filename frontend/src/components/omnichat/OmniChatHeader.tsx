import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, LogOut, Settings2, Sparkles, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import type { ConversationSettings } from '../../types/omnichat';
import OmniChatDefaultsModal from './OmniChatDefaultsModal';

export default function OmniChatHeader({
  defaults,
  onSaveDefaults,
  isSavingDefaults = false,
  onSignIn,
}: {
  defaults: ConversationSettings;
  onSaveDefaults: (settings: ConversationSettings) => Promise<void> | void;
  isSavingDefaults?: boolean;
  onSignIn: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : 'OC';
  const signInLabel = t('auth.buttons.signIn');
  const logoutLabel = t('auth.buttons.logout');
  const resolvedSignInLabel = signInLabel === 'auth.buttons.signIn' ? 'Sign in' : signInLabel;
  const resolvedLogoutLabel = logoutLabel === 'auth.buttons.logout' ? 'Log out' : logoutLabel;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 h-[72px] border-b border-white/[0.08] bg-[#090a0f]/80 backdrop-blur-2xl">
        <div className="flex h-full items-center justify-between px-5 lg:px-6">
          <Link to="/omnichat" className="group flex items-center gap-3 text-white">
            <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-[14px] border border-white/15 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-400 shadow-[0_8px_30px_rgba(139,92,246,0.3)] transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105">
              <Sparkles size={17} strokeWidth={2.2} />
              <span className="absolute inset-x-1 top-0 h-px bg-white/70" />
            </span>
            <span>
              <span className="block text-[1.2rem] font-bold leading-none tracking-[-0.035em] sm:text-[1.28rem]">OmniChat</span>
              <span className="mt-1 hidden text-[9px] font-semibold uppercase tracking-[0.22em] text-white/35 sm:block">Stories that answer back</span>
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex h-10 items-center gap-2.5 rounded-[18px] border border-white/10 bg-white/[0.055] px-3 text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition hover:border-white/20 hover:bg-white/10"
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[11px] font-semibold text-[var(--color-primary-light)]">
                    {initials}
                  </span>
                  <span className="hidden text-sm font-medium text-white/80 sm:inline">
                    {user?.username}
                  </span>
                  <ChevronDown size={16} className="text-white/50" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="flex h-10 items-center gap-2.5 rounded-[18px] border border-white/10 bg-white/[0.055] px-3 text-white transition hover:border-white/20 hover:bg-white/10"
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[11px] font-semibold text-[var(--color-primary-light)]">
                    <UserRound size={16} />
                  </span>
                  <span className="hidden text-sm font-medium text-white/80 sm:inline">
                    {resolvedSignInLabel}
                  </span>
                </button>
              )}

              {menuOpen && (
                <div className="absolute right-0 top-[calc(100%+12px)] w-60 rounded-3xl border border-white/10 bg-[#191920] p-2 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setDefaultsOpen(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
                  >
                    <Settings2 size={16} />
                    {t('omnichat.header.defaults')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                      navigate('/omnichat');
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
                  >
                    <LogOut size={16} />
                    {resolvedLogoutLabel}
                  </button>
                </div>
              )}
            </div>

            <Link
              to="/"
              className="group flex h-10 items-center gap-1.5 rounded-[18px] border border-white/10 bg-white/[0.035] px-3.5 text-sm font-semibold text-white/65 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <span className="hidden sm:inline">{t('omnichat.exitToSite')}</span>
              <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <OmniChatDefaultsModal
        isOpen={defaultsOpen}
        onClose={() => setDefaultsOpen(false)}
        defaults={defaults}
        onSave={onSaveDefaults}
        isSaving={isSavingDefaults}
      />
    </>
  );
}
