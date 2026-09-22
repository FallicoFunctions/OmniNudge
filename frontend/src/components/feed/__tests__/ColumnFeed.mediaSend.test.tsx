/**
 * What the feed column's "New Message" box uploads with a file.
 *
 * It used to upload the file itself: messagesService encrypted the text, so the
 * conversation read as end-to-end encrypted, while the image beside it sat on
 * the server in the clear. No test drove this path at all, which is how that
 * lasted. These tests read the bytes handed to the upload and the request handed
 * to sendMessage, with real keys and real crypto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import { ColumnFeed } from '../ColumnFeed';
import type { ColumnConfig } from '../../../contexts/MultiColumnFeedContext';
import { messagesService } from '../../../services/messagesService';
import { encryptionService } from '../../../services/encryptionService';
import { getOwnKeys, getUserPublicKey } from '../../../services/keyManagementService';
import { mediaService } from '../../../services/mediaService';
import { decryptFile, generateKeyPair } from '../../../utils/encryption';
import type { KeyPair } from '../../../utils/encryption';

const state = vi.hoisted(() => ({ uploaded: [] as File[] }));

// The column draws its "New Message" box only when it has at least one item:
// with none it returns its empty state instead. So the feed holds one
// conversation, which is what a real messages column looks like anyway.
vi.mock('../../../hooks/useColumnFeed', () => ({
  useColumnFeed: () => ({
    data: {
      pages: [
        {
          conversations: [
            {
              id: 77,
              conversation_type: 'dm',
              created_at: '2026-01-01T00:00:00Z',
              last_message_at: '2026-01-01T00:00:00Z',
              unread_count: 0,
              other_user: { id: 43, username: 'bob' },
            },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'tester' } }),
}));
vi.mock('../../../services/usersService', () => ({
  usersService: { getProfile: vi.fn(async () => ({ id: 42, username: 'alice' })) },
}));
vi.mock('../../../services/messagesService', () => ({
  messagesService: {
    sendMessage: vi.fn(async () => ({ id: 1, conversation_id: 77 })),
  },
}));
vi.mock('../../../services/encryptionService', () => ({
  encryptionService: { getPublicKeys: vi.fn() },
}));
vi.mock('../../../services/keyManagementService', () => ({
  getOwnKeys: vi.fn(),
  getUserPublicKey: vi.fn(),
}));
vi.mock('../../../services/mediaService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/mediaService')>();
  return {
    ...actual,
    mediaService: {
      ...actual.mediaService,
      uploadMedia: vi.fn(async (file: File) => {
        state.uploaded.push(file);
        return {
          id: 555,
          storage_url: '/uploads/7/1_photo.png',
          file_type: file.type,
          file_size: file.size,
        };
      }),
    },
  };
});

const ORIGINAL = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6]);

// FileReader returns an ArrayBuffer from jsdom's realm, which Node's WebCrypto
// rejects; Node's own Buffer is always accepted.
const sameRealm = (bytes: Uint8Array): ArrayBuffer => Buffer.from(bytes) as unknown as ArrayBuffer;
const bytesOf = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

async function sendAFileToAlice() {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ColumnFeed
          columnId="c1"
          config={{ feedType: 'messages' } as unknown as ColumnConfig}
          isActive
          showBorder={false}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('emptyStates.inbox.actions.newMessage') })
  );
  const username = screen.getByPlaceholderText(i18n.t('messages.compose.enterUsername'));
  fireEvent.change(username, { target: { value: 'alice' } });
  fireEvent.keyDown(username, { key: 'Enter' });

  const input = await waitFor(() => {
    const found = view.container.querySelector('input[type="file"]');
    expect(found).not.toBeNull();
    return found as HTMLInputElement;
  });
  fireEvent.change(input, {
    target: { files: [new File([ORIGINAL], 'photo.png', { type: 'image/png' })] },
  });
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('messages.send') }));
}

let own: KeyPair;
let recipient: KeyPair;

beforeEach(async () => {
  vi.clearAllMocks();
  state.uploaded = [];
  own = await generateKeyPair();
  recipient = await generateKeyPair();
  vi.mocked(getOwnKeys).mockResolvedValue(own);
  vi.mocked(getUserPublicKey).mockResolvedValue(recipient.publicKey);
  vi.mocked(encryptionService.getPublicKeys).mockResolvedValue({ 42: 'recipient-key-b64' });
});

describe('the feed column new-message box, sending a file', () => {
  it('uploads only ciphertext, and gives each reader a key that opens it', async () => {
    await sendAFileToAlice();
    await waitFor(() => expect(messagesService.sendMessage).toHaveBeenCalled());

    // What left the device: not the file, and marked as ciphertext.
    expect(state.uploaded).toHaveLength(1);
    expect(vi.mocked(mediaService.uploadMedia).mock.calls[0][1]).toEqual({ encrypted: true });
    const uploaded = await bytesOf(state.uploaded[0]);
    expect(uploaded).not.toEqual(ORIGINAL);

    // And the request carries a key for each reader, both of which open it.
    const request = vi.mocked(messagesService.sendMessage).mock.calls.at(-1)![0];
    expect(request.media_encryption_key).toBeTruthy();
    expect(request.sender_media_encryption_key).toBeTruthy();
    for (const [wrapped, reader] of [
      [request.media_encryption_key!, recipient],
      [request.sender_media_encryption_key!, own],
    ] as const) {
      const opened = await decryptFile(
        {
          encryptedData: sameRealm(uploaded),
          encryptedKey: wrapped,
          iv: request.media_encryption_iv!,
          originalName: '',
          mimeType: 'image/png',
        },
        reader.privateKey
      );
      expect(await bytesOf(opened)).toEqual(ORIGINAL);
    }
  });

  it('uploads nothing and says why when the recipient has no key', async () => {
    vi.mocked(encryptionService.getPublicKeys).mockResolvedValue({});

    await sendAFileToAlice();

    expect(
      await screen.findByText(i18n.t('messages.errors.recipientKeyNotFound'))
    ).toBeInTheDocument();
    expect(state.uploaded).toHaveLength(0);
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
  });
});
