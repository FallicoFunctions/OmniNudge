import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { PinnedMessagesBar } from '../PinnedMessagesBar';
import { forgetGroupKeys } from '../../../services/groupKeyCache';
import { decryptForDisplay } from '../../../hooks/useDecryptedContent';
import type { Message } from '../../../types/messages';

vi.mock('../../../hooks/useDecryptedContent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDecryptedContent')>()),
  decryptForDisplay: vi.fn(),
}));
vi.mock('../../../services/keyManagementService', () => ({
  getOwnKeys: vi.fn(async () => null),
  getOwnPublicKeyBase64: vi.fn(),
}));

const pinned = {
  id: 5,
  conversation_id: 47,
  sender_id: 8,
  encrypted_content: '{"v":1}',
  encryption_version: 'group-v1',
  message_type: 'text',
  sent_at: new Date().toISOString(),
} as unknown as Message;

beforeEach(() => {
  vi.mocked(decryptForDisplay).mockReset();
});

describe('PinnedMessagesBar', () => {
  // The pinned bar decrypted once. A newcomer given the key afterwards kept
  // seeing the pin as locked until the page reloaded.
  it('opens a pinned group message once a key has arrived', async () => {
    vi.mocked(decryptForDisplay).mockResolvedValue({ status: 'failed', text: '{"v":1}' });
    render(
      <PinnedMessagesBar
        pinnedMessages={[pinned]}
        currentUserId={7}
        expanded
        onToggleExpanded={() => {}}
        onJumpToMessage={() => {}}
        onUnpinMessage={() => {}}
      />
    );
    await vi.waitFor(() => expect(decryptForDisplay).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('meet at six')).not.toBeInTheDocument();

    vi.mocked(decryptForDisplay).mockResolvedValue({ status: 'decrypted', text: 'meet at six' });
    act(() => forgetGroupKeys(47));

    expect(await screen.findByText('meet at six')).toBeInTheDocument();
  });
});
