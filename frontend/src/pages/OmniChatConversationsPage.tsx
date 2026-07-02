import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import { useOmniChatLayoutMode } from '../hooks/useOmniChatLayoutMode';
import { useAuth } from '../contexts/AuthContext';
import OmniChatSidebar from '../components/omnichat/OmniChatSidebar';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import type { BotConversation } from '../types/omnichat';
import { format } from 'date-fns';

function ConversationRow({
  conversation,
  onClick,
}: {
  conversation: BotConversation;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const displayName = conversation.title || conversation.persona?.name || 'Unknown';
  const subtitle = conversation.persona?.description?.trim() || t('omnichat.conversationsPage.noMessages');
  
  let lastMessageTime = '';
  try {
    const date = new Date(conversation.last_message_at);
    if (!isNaN(date.getTime())) {
      lastMessageTime = format(date, 'h:mm a');
    }
  } catch {
    // Invalid date — leave empty
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition-colors hover:bg-[var(--color-surface-elevated)]"
    >
      {conversation.persona && (
        <PersonaAvatar
          persona={conversation.persona}
          className="h-12 w-12 flex-shrink-0 rounded-full"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
          {displayName}
        </p>
        <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">
          {subtitle}
        </p>
      </div>
      {lastMessageTime && (
        <span className="flex-shrink-0 text-xs text-[var(--color-text-secondary)]">
          {lastMessageTime}
        </span>
      )}
    </button>
  );
}

export default function OmniChatConversationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode: layoutMode } = useOmniChatLayoutMode();
  const { isAuthenticated } = useAuth();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('conversations');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const conversationsQuery = useQuery({
    queryKey: omnichatQueryKeys.conversations,
    queryFn: () => omnichatService.listConversations(),
    enabled: isAuthenticated,
  });

  const filteredConversations = conversationsQuery.data?.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (conv.title || conv.persona?.name || '').toLowerCase();
    return name.includes(q);
  }) ?? [];

  const handleSidebarTabChange = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    if (tab === 'discover') {
      navigate('/omnichat');
    } else if (tab === 'search') {
      navigate('/omnichat?search=1');
    }
    // Conversations tab stays on this page
  }, [navigate]);

  return (
    <div
      className={`omnichat-theme flex flex-col bg-[var(--color-background)] ${
        layoutMode === 'immersive' ? 'h-screen' : 'h-[calc(100vh-64px)]'
      }`}
    >
      <div className="flex flex-1 overflow-hidden">
        <OmniChatSidebar
          activeTab={sidebarTab}
          onTabChange={handleSidebarTabChange}
          isAuthenticated={isAuthenticated}
          onSignIn={() => {
            window.dispatchEvent(
              new CustomEvent('open-auth-modal', {
                detail: { mode: 'login', redirectTo: '/omnichat/conversations' },
              })
            );
          }}
          mobileOpen={mobileSidebarOpen}
          onMobileOpen={() => setMobileSidebarOpen(true)}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className="flex w-full flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-[var(--color-text-primary)]">
                {t('omnichat.conversationsPage.title')}
              </h1>
            </div>

            {/* Search bar */}
            <div className="relative mt-3">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('omnichat.conversationsPage.searchPlaceholder')}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-8 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>

          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto p-4">
            {!isAuthenticated ? (
              <div className="py-10 text-center">
                <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                  {t('omnichat.sidebar.signInToViewConversations')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('open-auth-modal', {
                        detail: { mode: 'login', redirectTo: '/omnichat/conversations' },
                      })
                    );
                  }}
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]"
                >
                  {t('auth.buttons.signIn')}
                </button>
              </div>
            ) : conversationsQuery.isLoading ? (
              <div className="py-10 text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {t('common.loading')}
                </p>
              </div>
            ) : conversationsQuery.isError ? (
              <div className="py-10 text-center">
                <p className="text-sm text-red-500">
                  {t('omnichat.discover.conversationsLoadError')}
                </p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {t('omnichat.conversationsPage.empty')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    onClick={() => navigate(`/omnichat/c/${conversation.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
