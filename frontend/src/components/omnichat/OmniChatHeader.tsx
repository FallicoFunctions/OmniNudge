import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Settings2, UserRound } from 'lucide-react';
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

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 h-[72px] border-b border-white/10 bg-[#131316]/95 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between px-5 lg:px-6">
          <div className="flex items-center gap-4">
            <Link to="/omnichat" className="text-[1.65rem] font-semibold tracking-tight text-white hover:text-white/80 transition-colors">OmniChat</Link>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex h-9 items-center gap-2.5 rounded-[18px] border border-white/10 bg-white/5 px-3 text-white transition hover:bg-white/10"
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
                  className="flex h-9 items-center gap-2.5 rounded-[18px] border border-white/10 bg-white/5 px-3 text-white transition hover:bg-white/10"
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[11px] font-semibold text-[var(--color-primary-light)]">
                    <UserRound size={16} />
                  </span>
                  <span className="hidden text-sm font-medium text-white/80 sm:inline">
                    {t('auth.buttons.signIn')}
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
                    {t('auth.buttons.logout')}
                  </button>
                </div>
              )}
            </div>

            <Link
              to="/"
              className="flex h-9 items-center rounded-[18px] border border-white/10 bg-white/5 px-3.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {t('omnichat.exitToSite')}
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
