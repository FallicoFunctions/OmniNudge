/**
 * The feed card's message preview tested encryption_version === 'v1' alone --
 * no v2, no v2: prefix -- so every v2 message showed its ciphertext in the
 * feed. Nothing covered this file, which is why it stayed that way.
 */
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'me' }, isAuthenticated: true }),
}));
vi.mock('../../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatNumber: (n: number) => String(n),
    formatRelativeTime: () => 'just now',
    formatDate: () => 'Jan 1, 2026',
  }),
}));
vi.mock('../../../services/hubsService', () => ({ hubsService: { getHub: vi.fn() } }));
vi.mock('../HlsVideo', () => ({ HlsVideo: () => null }));
vi.mock('../../common/HlsVideo', () => ({ HlsVideo: () => null }));
vi.mock('../ImageCarousel', () => ({ ImageCarousel: () => null }));
vi.mock('../ExpandedPost', () => ({ ExpandedPost: () => null }));
vi.mock('../ExpandedMessage', () => ({ ExpandedMessage: () => null }));
vi.mock('../../../utils/encryption', () => ({
  decryptMessage: vi.fn(async () => 'the real message'),
  decryptMultiRecipientContent: vi.fn(),
}));
vi.mock('../../../services/keyManagementService', () => ({
  getOwnKeys: vi.fn(async () => ({ privateKey: {}, publicKey: {} })),
}));

import { CompactPostCard } from '../CompactPostCard';

const CIPHER = 'v2:blob-that-must-never-be-shown';

const conversation = {
  id: 1,
  conversation_type: 'dm',
  created_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
  unread_count: 0,
  other_user: { id: 9, username: 'alice' },
  latest_message: {
    id: 5,
    conversation_id: 1,
    sender_id: 9,
    encrypted_content: CIPHER,
    encryption_version: 'v2',
    message_type: 'text',
    sent_at: new Date().toISOString(),
  },
};

const renderCard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <CompactPostCard post={conversation as never} feedType="messages" postIndex={0} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('CompactPostCard message preview', () => {
  it('shows the decrypted text of a v2 message, never the stored blob', async () => {
    const { container } = renderCard();
    expect(await screen.findByText('the real message')).toBeInTheDocument();
    expect(container.textContent).not.toContain('blob-that-must-never-be-shown');
  });

  it('does not paint the ciphertext even for an instant', async () => {
    // The old preview called setPreview(cipherText) before attempting, so the
    // blob was on screen for a frame on every card.
    const { container } = renderCard();
    expect(container.textContent).not.toContain('blob-that-must-never-be-shown');
    await waitFor(() => expect(screen.getByText('the real message')).toBeInTheDocument());
  });
});
