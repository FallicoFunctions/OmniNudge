/**
 * Mod mail had one branch that sent the raw message: when no participant could
 * be encrypted for, it returned the plaintext and posted it. Its two sibling
 * refusals threw. These tests hold all three to the same rule.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: undefined, isAuthenticated: false }),
}));

vi.mock('../../../services/modMailService', () => ({
  modMailService: {
    getRecipients: vi.fn().mockResolvedValue({ hub_name: 'testHub', recipient_ids: [] }),
    createModMail: vi.fn().mockResolvedValue({ conversation_id: 1, message_id: 1 }),
  },
}));

vi.mock('../../../services/encryptionService', () => ({
  encryptionService: { getPublicKeys: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../../../services/keyManagementService', () => ({
  getOwnKeys: vi.fn().mockResolvedValue({ publicKey: {} }),
  getUserPublicKey: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../utils/encryption', () => ({
  encryptForMultipleRecipients: vi.fn().mockResolvedValue({
    encryptedContent: 'cipher',
    senderEncryptedContent: 'sender-cipher',
    sharedIv: 'iv',
    recipientKeys: {},
  }),
}));

vi.mock('../../common/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../ui/ModalCloseButton', () => ({
  ModalCloseButton: () => <button type="button">close</button>,
}));

import { ModMailModal } from '../ModMailModal';
import { modMailService } from '../../../services/modMailService';

const renderModal = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ModMailModal hubName="testHub" onClose={() => {}} />
    </QueryClientProvider>
  );
};

describe('ModMailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends nothing when there is no participant to encrypt for', async () => {
    const { container } = renderModal();

    fireEvent.change(container.querySelector('#subject') as HTMLInputElement, {
      target: { value: 'A subject' },
    });
    fireEvent.change(container.querySelector('#message') as HTMLTextAreaElement, {
      target: { value: 'Something private' },
    });
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(container.textContent).toContain('modMailModal.encryption.noParticipants');
    });
    expect(modMailService.createModMail).not.toHaveBeenCalled();
  });

  // The rendered test above sees only the key, because t is mocked. The English
  // text itself promised "sending plaintext" long after the code stopped doing
  // it, so the sentence needs its own assertion.
  it('does not promise to send the message in clear', () => {
    const locale = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../public/locales/en.json'), 'utf8')
    );
    const warning: string = locale.modMailModal.encryption.noParticipants;
    expect(warning.toLowerCase()).not.toContain('plaintext');
    expect(warning.toLowerCase()).toContain('not sent');
  });
});
