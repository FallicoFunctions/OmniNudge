import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowUpRight, ChevronDown, LogOut, Settings2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import type { ConversationSettings } from '../../types/omnichat';
import OmniChatDefaultsModal from './OmniChatDefaultsModal';
import OmniChatCreditsMenu from './OmniChatCreditsMenu';
import LiveCallControls from './LiveCallControls';
import { useOmniChatCall } from './OmniChatCallProvider';

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
  const calls = useOmniChatCall();
  // A phone is too narrow for a call and the whole header. The call takes the
  // logo's place, like the call pill on a phone, and the exit waits for the
  // hang-up: leaving OmniChat would end the call anyway.
  const inCall = Boolean(calls?.call);

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : 'OC';
  const signInLabel = t('auth.buttons.signIn');
  const logoutLabel = t('auth.buttons.logout');
  const resolvedSignInLabel = signInLabel === 'auth.buttons.signIn' ? 'Sign in' : signInLabel;
  const resolvedLogoutLabel = logoutLabel === 'auth.buttons.logout' ? 'Log out' : logoutLabel;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 h-[var(--omnichat-header-offset)] border-b border-white/[0.08] bg-[#090a0f]/80 pt-[var(--omnichat-safe-top)] backdrop-blur-2xl">
        <div className="flex h-[var(--omnichat-header-height)] items-center justify-between gap-2 px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/omnichat"
              className={`omnichat-touch-target group shrink-0 items-center text-white ${inCall ? 'hidden sm:flex' : 'flex'}`}
            >
              <span>
                <span className="block text-[1.2rem] font-bold leading-none tracking-[-0.035em] sm:text-[1.28rem]">
                  OmniChat
                </span>
              </span>
            </Link>
            <LiveCallControls />
          </div>

          <div
            className={`flex shrink-0 items-center ${inCall ? 'gap-1.5 sm:gap-2.5' : 'gap-2.5'}`}
          >
            {isAuthenticated && <OmniChatCreditsMenu />}
            <div className="relative">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="omnichat-touch-target flex items-center gap-2.5 rounded-[18px] border border-white/10 bg-white/[0.055] px-3 text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition hover:border-white/20 hover:bg-white/10"
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[11px] font-semibold text-[var(--color-primary-light)]">
                    {initials}
                  </span>
                  <span className="hidden text-sm font-medium text-white/80 sm:inline">
                    {user?.username}
                  </span>
                  {/* No room on a phone: signed in with a five-digit balance, the
                      header already needed more than 360 px. */}
                  <ChevronDown size={16} className="hidden text-white/50 sm:block" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="omnichat-touch-target flex items-center gap-2.5 rounded-[18px] border border-white/10 bg-white/[0.055] px-3 text-white transition hover:border-white/20 hover:bg-white/10"
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
              className={`omnichat-touch-target group ${inCall ? 'hidden lg:flex' : 'flex'} items-center gap-1.5 rounded-[18px] border border-white/10 bg-white/[0.035] px-3.5 text-sm font-semibold text-white/65 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white`}
            >
              <span className="hidden sm:inline">{t('omnichat.exitToSite')}</span>
              <ArrowUpRight
                size={15}
                className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
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
