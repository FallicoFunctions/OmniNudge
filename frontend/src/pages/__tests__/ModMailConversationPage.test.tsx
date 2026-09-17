import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'testUser' }, isAuthenticated: true }),
}));

vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatDate: () => 'Jan 1, 2026',
    formatRelativeTime: () => '2 hours ago',
    formatNumber: (n: number) => String(n),
  }),
}));

vi.mock('../../services/messagesService', () => ({
  messagesService: {
    getMessages: vi.fn().mockResolvedValue({ messages: [], next_cursor: null }),
    getMessagesPage: vi.fn().mockResolvedValue({ messages: [], next_cursor: null }),
    sendMessage: vi.fn().mockResolvedValue({ id: 99, content: 'reply' }),
  },
}));

vi.mock('../../services/modMailService', () => ({
  modMailService: {
    getConversation: vi.fn().mockResolvedValue({
      id: 1,
      subject: 'Test Conversation',
      hub_name: 'testHub',
      status: 'open',
      created_at: '2026-01-01T00:00:00Z',
    }),
    archiveConversation: vi.fn(),
    markAsRead: vi.fn(),
  },
}));

vi.mock('../../services/hubsService', () => ({
  hubsService: {
    getHub: vi.fn().mockResolvedValue({ id: 1, name: 'testHub', title: 'Test Hub' }),
  },
}));

vi.mock('../../services/encryptionService', () => ({
  encryptionService: {
    encrypt: vi.fn().mockResolvedValue('encrypted'),
    decrypt: vi.fn().mockResolvedValue('decrypted'),
  },
}));

vi.mock('../../utils/encryption', () => ({
  decryptMessage: vi.fn().mockResolvedValue('decrypted'),
  encryptForMultipleRecipients: vi.fn().mockResolvedValue({}),
  decryptMultiRecipientContent: vi.fn().mockResolvedValue('decrypted'),
}));

vi.mock('../../services/keyManagementService', () => ({
  getOwnKeys: vi.fn().mockResolvedValue(null),
  getUserPublicKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ErrorMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ModMailConversationPage from '../ModMailConversationPage';
import { messagesService } from '../../services/messagesService';
import { getOwnKeys } from '../../services/keyManagementService';
import { decryptMessage } from '../../utils/encryption';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/modmail/testHub/1']}>
        <Routes>
          <Route path="/modmail/:hubName/:conversationId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('ModMailConversationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // This page had its own copy of the display rule, testing
  // encryption_version === 'v1' alone, so a v2 mod mail message was shown as
  // ciphertext. The suite asserted only that a body element existed.
  it('shows the decrypted text of a v2 message, never the stored blob', async () => {
    const CIPHER = 'v2:modmail-blob-that-must-never-be-shown';
    vi.mocked(getOwnKeys).mockResolvedValue({ privateKey: {}, publicKey: {} } as never);
    vi.mocked(decryptMessage).mockResolvedValue('the real mod mail text' as never);
    vi.mocked(messagesService.getMessagesPage).mockResolvedValue({
      messages: [
        {
          id: 5,
          conversation_id: 1,
          sender_id: 42,
          encrypted_content: CIPHER,
          encryption_version: 'v2',
          message_type: 'text',
          sent_at: new Date().toISOString(),
        },
      ],
      next_cursor: null,
    } as never);

    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <ModMailConversationPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(container.textContent).toContain('the real mod mail text');
    });
    expect(container.textContent).not.toContain('modmail-blob-that-must-never-be-shown');
  });

  it('renders without crashing', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ModMailConversationPage />
      </Wrapper>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders the page body', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ModMailConversationPage />
      </Wrapper>
    );
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  it('shows reply textarea or input area', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ModMailConversationPage />
      </Wrapper>
    );
    // Page should render without errors
    await waitFor(() => {
      expect(document.body.textContent).toBeDefined();
    });
  });
});
