/**
 * Sending from a conversation expanded in the feed column.
 *
 * The column lists every conversation, groups included, and expands any of
 * them. The expanded view looked for a single recipient before sending, so in a
 * group every message -- text or file -- stopped at "recipient not found". It
 * also sealed text itself, for one recipient, where the service already seals
 * for whichever kind of conversation it is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { Conversation } from '../../../types/messages';
import { ExpandedMessage } from '../ExpandedMessage';
import { groupKeyForSendingOrRefuse, messagesService } from '../../../services/messagesService';
import { encryptionService } from '../../../services/encryptionService';
import { getOwnKeys, getUserPublicKey } from '../../../services/keyManagementService';
import {
  base64ToArrayBuffer,
  decryptFile,
  decryptFileWithKey,
  generateKeyPair,
  importFileKey,
  type KeyPair,
} from '../../../utils/encryption';
import { isSealedGroupEnvelope, newGroupKey, openGroupMessage } from '../../../utils/groupKeys';

const state = vi.hoisted(() => ({ uploaded: [] as File[] }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'me' }, isAuthenticated: true }),
}));
vi.mock('../../../hooks/useFormat', () => ({
  useFormat: () => ({ formatDate: () => 'Jan 1', formatRelativeTime: () => 'now' }),
}));
vi.mock('../../../services/messagesService', () => ({
  groupKeyForSendingOrRefuse: vi.fn(),
  messagesService: {
    getMessagesPage: vi.fn(async () => ({ messages: [], next_cursor: undefined })),
    sendMessage: vi.fn(async () => ({ id: 1 })),
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
        return { id: 555, storage_url: '/uploads/7/1_photo.png', file_type: file.type };
      }),
    },
  };
});

const ORIGINAL = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 4, 5, 6]);
const sameRealm = (bytes: Uint8Array): ArrayBuffer => Buffer.from(bytes) as unknown as ArrayBuffer;
const bytesOf = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

const group = {
  id: 31,
  conversation_type: 'group',
  created_at: '2026-01-01T00:00:00Z',
  last_message_at: '2026-01-01T00:00:00Z',
  unread_count: 0,
  other_user: undefined,
} as unknown as Conversation;

const direct = {
  ...group,
  id: 32,
  conversation_type: 'dm',
  other_user: { id: 9, username: 'alice' },
} as unknown as Conversation;

function openAndSend(conversation: Conversation, text: string, file?: File) {
  const view = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ExpandedMessage conversation={conversation} onCollapse={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  if (file) {
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }
  fireEvent.change(screen.getByPlaceholderText('messages.typeMessage'), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'messages.send' }));
}

let own: KeyPair;
let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();
  state.uploaded = [];
  own = await generateKeyPair();
  vi.mocked(getOwnKeys).mockResolvedValue(own);
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('sending from an expanded group conversation', () => {
  it('sends text as content, for the service to seal for the group', async () => {
    openAndSend(group, 'hello group');
    await waitFor(() => expect(messagesService.sendMessage).toHaveBeenCalled());

    expect(alertSpy).not.toHaveBeenCalled();
    const request = vi.mocked(messagesService.sendMessage).mock.calls[0][0];
    expect(request).toMatchObject({ conversation_id: 31, content: 'hello group' });
    expect(request.encrypted_content).toBeUndefined();
  });

  it('seals a file under the group key and sends one envelope that opens it', async () => {
    const groupKey = await newGroupKey();
    vi.mocked(groupKeyForSendingOrRefuse).mockResolvedValue({ key: groupKey, version: 3 });

    openAndSend(group, 'a photo', new File([ORIGINAL], 'photo.png', { type: 'image/png' }));
    await waitFor(() => expect(messagesService.sendMessage).toHaveBeenCalled());

    expect(alertSpy).not.toHaveBeenCalled();
    const request = vi.mocked(messagesService.sendMessage).mock.calls[0][0];
    expect(isSealedGroupEnvelope(request.media_encryption_key!)).toBe(true);
    expect(request.group_key_version).toBe(3);
    const uploaded = await bytesOf(state.uploaded[0]);
    const fileKey = await importFileKey(
      base64ToArrayBuffer(await openGroupMessage(request.media_encryption_key!, groupKey))
    );
    const opened = await decryptFileWithKey(
      {
        encryptedData: sameRealm(uploaded),
        iv: request.media_encryption_iv!,
        mimeType: 'image/png',
      },
      fileKey
    );
    expect(await bytesOf(opened)).toEqual(ORIGINAL);
  });
});

describe('sending from an expanded direct conversation', () => {
  it('seals a file for the recipient and the sender, with the key the server publishes', async () => {
    const recipient = await generateKeyPair();
    vi.mocked(encryptionService.getPublicKeys).mockResolvedValue({ 9: 'published-b64' });
    vi.mocked(getUserPublicKey).mockResolvedValue(recipient.publicKey);

    openAndSend(direct, 'a photo', new File([ORIGINAL], 'photo.png', { type: 'image/png' }));
    await waitFor(() => expect(messagesService.sendMessage).toHaveBeenCalled());

    expect(alertSpy).not.toHaveBeenCalled();
    expect(getUserPublicKey).toHaveBeenCalledWith(9, 'published-b64');
    const request = vi.mocked(messagesService.sendMessage).mock.calls[0][0];
    expect(request).toMatchObject({ conversation_id: 32, content: 'a photo' });
    const uploaded = sameRealm(await bytesOf(state.uploaded[0]));
    for (const [reader, key] of [
      [recipient, request.media_encryption_key!],
      [own, request.sender_media_encryption_key!],
    ] as const) {
      const opened = await decryptFile(
        {
          encryptedData: uploaded,
          encryptedKey: key,
          iv: request.media_encryption_iv!,
          originalName: '',
          mimeType: 'image/png',
        },
        reader.privateKey
      );
      expect(await bytesOf(opened)).toEqual(ORIGINAL);
    }
  });
});
