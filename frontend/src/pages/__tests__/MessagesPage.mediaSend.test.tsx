/**
 * What the composer actually uploads and sends with a file.
 *
 * Until G4a-2b every way this could fail uploaded the original file with a
 * console warning, and a group always failed that way: a group conversation has
 * no other_user, so there was never a recipient to wrap for. These tests read
 * the two artifacts that leave the device -- the bytes handed to the upload, and
 * the request handed to sendMessage -- for a group, a direct message, and the
 * refusals, with real keys and real crypto throughout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import MessagesPage from '../MessagesPage';
import type { Conversation } from '../../types/messages';
import { groupKeyForSendingOrRefuse, messagesService } from '../../services/messagesService';
import { encryptionService } from '../../services/encryptionService';
import { getOwnKeys, getUserPublicKey } from '../../services/keyManagementService';
import { mediaService } from '../../services/mediaService';
import {
  base64ToArrayBuffer,
  decryptFile,
  decryptFileWithKey,
  generateKeyPair,
  importFileKey,
} from '../../utils/encryption';
import type { KeyPair } from '../../utils/encryption';
import {
  isSealedGroupEnvelope,
  newGroupKey,
  openGroupMessage,
  sealedKeyVersion,
} from '../../utils/groupKeys';
import { MessageNotSent } from '../../utils/messageSendErrors';

const state = vi.hoisted(() => ({
  conversations: [] as unknown[],
  uploaded: [] as File[],
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'tester' } }),
}));
vi.mock('../../contexts/MessagingContext', () => ({
  useMessagingContext: () => ({ setActiveConversationId: vi.fn() }),
}));
vi.mock('../../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ sendTypingIndicator: vi.fn(), isUserOnline: vi.fn(() => false) }),
}));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ typingIndicators: false, readReceipts: false, speakerDeviceId: '' }),
}));
vi.mock('../../hooks/useArchive', () => ({
  useArchive: () => ({
    archiveConversation: vi.fn(),
    archiveConversationsBatch: vi.fn(),
    unarchiveConversation: vi.fn(),
    isArchiving: false,
    isBatchArchiving: false,
    isUnarchiving: false,
  }),
}));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../services/hubsService', () => ({
  hubsService: {
    searchHubs: vi.fn(async () => []),
    getHubPosts: vi.fn(async () => ({ posts: [] })),
  },
}));
vi.mock('../../services/redditService', () => ({
  redditService: {
    autocompleteSubreddits: vi.fn(async () => []),
    getSubredditPosts: vi.fn(async () => ({ posts: [] })),
  },
}));
vi.mock('../../services/messagesService', () => ({
  groupKeyForSendingOrRefuse: vi.fn(),
  messagesService: {
    getConversationsPage: vi.fn(async () => ({
      conversations: state.conversations,
      next_cursor: undefined,
    })),
    getArchivedConversationsPage: vi.fn(async () => ({
      conversations: [],
      next_cursor: undefined,
    })),
    getMessagesPage: vi.fn(async () => ({ messages: [], next_cursor: undefined })),
    getPinnedMessages: vi.fn(async () => ({ pinned_messages: [] })),
    sendMessage: vi.fn(async () => ({
      id: 9100,
      conversation_id: 0,
      sender_id: 7,
      encrypted_content: '',
      message_type: 'image',
      sent_at: new Date().toISOString(),
    })),
  },
}));
vi.mock('../../services/encryptionService', () => ({
  encryptionService: { getPublicKeys: vi.fn() },
}));
vi.mock('../../services/keyManagementService', () => ({
  getOwnKeys: vi.fn(),
  getUserPublicKey: vi.fn(),
}));
vi.mock('../../services/mediaService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/mediaService')>();
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

const now = new Date().toISOString();
const groupConversation = {
  id: 500,
  conversation_type: 'group',
  is_group: true,
  group_name: 'Book club',
  participant_count: 3,
  current_user_role: 'member',
  user1_id: null,
  user2_id: null,
  created_at: now,
  last_message_at: now,
  unread_count: 0,
  archived_at: null,
  is_archived: false,
} as unknown as Conversation;

const dmConversation: Conversation = {
  id: 101,
  conversation_type: 'dm',
  created_at: now,
  last_message_at: now,
  unread_count: 0,
  archived_at: null,
  is_archived: false,
  other_user: { id: 42, username: 'alice' },
};

// A real PNG signature, so nothing on the way can tell it is a fixture.
const ORIGINAL = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 250]);

// FileReader hands back an ArrayBuffer from jsdom's realm, and Node's WebCrypto
// rejects one of those as "not instance of ArrayBuffer". Copying it with the
// global Uint8Array is not enough here, because that constructor is jsdom's too;
// Node's own Buffer is always Node's, and WebCrypto accepts it by name.
const sameRealm = (bytes: Uint8Array): ArrayBuffer => Buffer.from(bytes) as unknown as ArrayBuffer;

const bytesOf = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter>
        <MessagesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

/** Open the only conversation in the list, attach a PNG, and press send. */
async function sendAFile() {
  const view = renderPage();
  fireEvent.click((await screen.findAllByRole('button', { name: 'Open conversation' }))[0]);
  const input = await waitFor(() => {
    const found = view.container.querySelector('form input[type="file"]');
    expect(found).not.toBeNull();
    return found as HTMLInputElement;
  });
  fireEvent.change(input, {
    target: { files: [new File([ORIGINAL], 'photo.png', { type: 'image/png' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  return view;
}

let own: KeyPair;
let recipient: KeyPair;
let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();
  state.uploaded = [];
  own = await generateKeyPair();
  recipient = await generateKeyPair();
  vi.mocked(getOwnKeys).mockResolvedValue(own);
  vi.mocked(getUserPublicKey).mockResolvedValue(recipient.publicKey);
  vi.mocked(encryptionService.getPublicKeys).mockResolvedValue({ 42: 'recipient-key-b64' });
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('sending a file to a group', () => {
  it('uploads only ciphertext, and sends one envelope that opens it', async () => {
    state.conversations = [groupConversation];
    const groupKey = await newGroupKey();
    vi.mocked(groupKeyForSendingOrRefuse).mockResolvedValue({ key: groupKey, version: 4 });

    await sendAFile();
    await waitFor(() => expect(messagesService.sendMessage).toHaveBeenCalled());

    // What left the device, first: the uploaded bytes are not the file, and the
    // upload says so -- without the flag the server refuses every ciphertext.
    expect(state.uploaded).toHaveLength(1);
    expect(vi.mocked(mediaService.uploadMedia).mock.calls[0][1]).toEqual({ encrypted: true });
    const uploaded = await bytesOf(state.uploaded[0]);
    expect(uploaded).not.toEqual(ORIGINAL);
    expect(state.uploaded[0].type).toBe('application/octet-stream');

    // Second: the request carries a group envelope and no per-reader copy.
    const request = vi.mocked(messagesService.sendMessage).mock.calls.at(-1)![0];
    expect(isSealedGroupEnvelope(request.media_encryption_key!)).toBe(true);
    expect(sealedKeyVersion(request.media_encryption_key!)).toBe(4);
    expect(request.group_key_version).toBe(4);
    expect(request.sender_media_encryption_key).toBeUndefined();

    // And the two agree: the envelope opens the uploaded bytes to the original.
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
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('uploads nothing and says why when a member has not set up encryption', async () => {
    state.conversations = [groupConversation];
    vi.mocked(groupKeyForSendingOrRefuse).mockRejectedValue(
      new MessageNotSent('group-member-not-set-up', 'No usable key for 1 member(s)')
    );

    await sendAFile();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    expect(state.uploaded).toHaveLength(0);
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(i18n.t('messages.errors.groupMemberNotSetUp'));
  });
});

describe('sending a file in a direct message', () => {
  it('uploads only ciphertext, and gives each reader a key that opens it', async () => {
    state.conversations = [dmConversation];

    await sendAFile();
    await waitFor(() => expect(messagesService.sendMessage).toHaveBeenCalled());

    expect(state.uploaded).toHaveLength(1);
    expect(vi.mocked(mediaService.uploadMedia).mock.calls[0][1]).toEqual({ encrypted: true });
    const uploaded = await bytesOf(state.uploaded[0]);
    expect(uploaded).not.toEqual(ORIGINAL);

    const request = vi.mocked(messagesService.sendMessage).mock.calls.at(-1)![0];
    expect(isSealedGroupEnvelope(request.media_encryption_key!)).toBe(false);
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
    state.conversations = [dmConversation];
    vi.mocked(encryptionService.getPublicKeys).mockResolvedValue({});

    await sendAFile();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    // This is the case that used to upload the original file.
    expect(state.uploaded).toHaveLength(0);
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(i18n.t('messages.errors.recipientKeyNotFound'));
  });

  it('uploads nothing when this device has no keys of its own', async () => {
    state.conversations = [dmConversation];
    vi.mocked(getOwnKeys).mockResolvedValue(null);

    await sendAFile();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    expect(state.uploaded).toHaveLength(0);
    expect(alertSpy).toHaveBeenCalledWith(i18n.t('messages.errors.encryptionKeysMissing'));
  });
});

// Keep the upload mock honest: it is the only thing standing in for the server.
describe('the upload stand-in', () => {
  it('is the mediaService the page calls', () => {
    expect(vi.isMockFunction(mediaService.uploadMedia)).toBe(true);
  });
});

// jsdom has no layout, so this reads the two rules the layout depends on. At a
// phone's width the text box kept its intrinsic width, and the Send button --
// longer still while it said "Uploading..." -- was pushed off the screen. It
// was measured in a browser at 320 and 375 pixels before and after.
describe('the composer row on a phone', () => {
  it('lets the text box shrink, so the send button stays on screen on one line', async () => {
    state.conversations = [dmConversation];
    const view = renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open conversation' }))[0]);
    const send = await screen.findByRole('button', { name: 'Send' });
    const text = view.container.querySelector('form input[type="text"]') as HTMLInputElement;

    expect(text.className.split(' ')).toContain('min-w-0');
    expect(send.className.split(' ')).toEqual(
      expect.arrayContaining(['shrink-0', 'whitespace-nowrap'])
    );
  });
});
