/**
 * One rule for showing a stored media file.
 *
 * Every expectation here was first read off a differential run against the two
 * copies this replaced, over seventeen inputs. The interesting parts are the
 * type table -- the stored bytes are uploaded as application/octet-stream, so
 * the extension is all there is to go on -- and the fallbacks, which hand the
 * browser the stored URL whenever the file cannot be opened.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDecryptedMedia } from '../useDecryptedMedia';
import {
  arrayBufferToBase64,
  decryptFile,
  decryptFileWithKey,
  importFileKey,
} from '../../utils/encryption';
import { newGroupKey, sealGroupMessage } from '../../utils/groupKeys';
import { groupKeyForVersion } from '../../services/groupKeyCache';
import { getOwnKeys } from '../../services/keyManagementService';
import { authenticatedFetch } from '../../services/authSession';
import type { Message } from '../../types/messages';

// The base64 helpers stay real, because the group path carries the file's key
// through them and a stubbed pair would prove nothing about what is handed to
// importFileKey. groupKeys stays real for the same reason: the envelopes in
// these tests are sealed by the code that seals them in production.
vi.mock('../../utils/encryption', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/encryption')>()),
  decryptFile: vi.fn(),
  decryptFileWithKey: vi.fn(),
  importFileKey: vi.fn(),
}));
vi.mock('../../services/groupKeyCache', () => ({ groupKeyForVersion: vi.fn() }));
vi.mock('../../services/keyManagementService', () => ({ getOwnKeys: vi.fn() }));
vi.mock('../../services/authSession', () => ({ authenticatedFetch: vi.fn() }));

const KEYS = { privateKey: {}, publicKey: {} } as never;
const ENCRYPTED = { media_encryption_key: 'KEY-FOR-RECIPIENT', media_encryption_iv: 'IV' };

const message = (over: Record<string, unknown>): Message =>
  ({
    id: 1,
    conversation_id: 1,
    sender_id: 1,
    message_type: 'image',
    ...over,
  }) as unknown as Message;

const respondOk = () =>
  vi.mocked(authenticatedFetch).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'ok',
    arrayBuffer: async () => new ArrayBuffer(8),
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:decrypted');
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.mocked(getOwnKeys).mockResolvedValue(KEYS);
  vi.mocked(decryptFile).mockResolvedValue(new Blob(['plain']) as never);
  vi.mocked(decryptFileWithKey).mockResolvedValue(new Blob(['group-plain']) as never);
  vi.mocked(importFileKey).mockResolvedValue({ type: 'file-key' } as never);
  respondOk();
});

// A group file is sealed once for the whole group: there is no per-reader copy,
// and the stored key is an envelope rather than an RSA-wrapped key. The rule has
// to recognise that from the envelope itself, because a message carrying a file
// and no text is labelled encryption_version 'none'.
describe('group media', () => {
  const FILE_KEY_BYTES = new Uint8Array(32).fill(7);

  /** A real envelope, sealed by the same function the sender uses. */
  const sealedFileKey = async (version = 3) => {
    const groupKey = await newGroupKey();
    const sealed = await sealGroupMessage(
      arrayBufferToBase64(FILE_KEY_BYTES.buffer),
      groupKey,
      version
    );
    return { groupKey, sealed };
  };

  it('opens the file with the group key for the version the envelope names', async () => {
    const { groupKey, sealed } = await sealedFileKey(3);
    vi.mocked(groupKeyForVersion).mockResolvedValue(groupKey);

    const { result } = render(
      message({
        conversation_id: 55,
        media_url: '/u/a.png',
        media_encryption_key: sealed,
        media_encryption_iv: 'IV',
      })
    );

    await waitFor(() => expect(result.current).toBe('blob:decrypted'));
    // The version came out of the envelope, not from a column beside it.
    expect(groupKeyForVersion).toHaveBeenCalledWith(55, 3);
    // The key handed to the file is the one that was sealed, byte for byte.
    expect(new Uint8Array(vi.mocked(importFileKey).mock.calls[0][0])).toEqual(FILE_KEY_BYTES);
    expect(vi.mocked(decryptFileWithKey).mock.calls[0][0]).toMatchObject({
      iv: 'IV',
      mimeType: 'image/png',
    });
    // The RSA path is for direct messages and must not run for a group file.
    expect(decryptFile).not.toHaveBeenCalled();
  });

  it('shows nothing, not the stored ciphertext, when the version cannot be opened', async () => {
    const { sealed } = await sealedFileKey();
    vi.mocked(groupKeyForVersion).mockResolvedValue(null);

    const { result } = render(
      message({
        conversation_id: 55,
        media_url: '/u/a.png',
        media_encryption_key: sealed,
        media_encryption_iv: 'IV',
      })
    );

    await waitFor(() => expect(groupKeyForVersion).toHaveBeenCalled());
    expect(result.current).toBeNull();
    // Nothing was even fetched: the bytes are unreadable without the key.
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('ignores the sender copy, because a group seals one envelope for everyone', async () => {
    const { groupKey, sealed } = await sealedFileKey();
    vi.mocked(groupKeyForVersion).mockResolvedValue(groupKey);

    const { result } = render(
      message({
        conversation_id: 55,
        media_url: '/u/a.png',
        media_encryption_key: sealed,
        sender_media_encryption_key: 'RSA-COPY-THAT-MUST-NOT-BE-USED',
        media_encryption_iv: 'IV',
      }),
      true
    );

    await waitFor(() => expect(result.current).toBe('blob:decrypted'));
    expect(decryptFile).not.toHaveBeenCalled();
  });

  // The version field exists because it will change. A reader that did not
  // recognise a newer envelope would send the file down the per-recipient
  // branch, fail to unwrap it as an RSA key, and fall back to the stored bytes
  // -- which are ciphertext. It must be claimed as a group file and then
  // refused, not handed to the other branch.
  it('shows nothing for an envelope sealed by a newer version than it can open', async () => {
    const future = JSON.stringify({ v: 99, k: 4, iv: 'aXY=', data: 'ZGF0YQ==' });

    const { result } = render(
      message({
        conversation_id: 55,
        media_url: '/u/a.png',
        media_encryption_key: future,
        media_encryption_iv: 'IV',
      })
    );

    await waitFor(() => expect(result.current).toBeNull());
    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(decryptFile).not.toHaveBeenCalled();
  });

  it('shows nothing when the message has no conversation to fetch a key for', async () => {
    const { sealed } = await sealedFileKey();

    const { result } = render(
      message({
        conversation_id: undefined,
        media_url: '/u/a.png',
        media_encryption_key: sealed,
        media_encryption_iv: 'IV',
      })
    );

    await waitFor(() => expect(authenticatedFetch).not.toHaveBeenCalled());
    expect(result.current).toBeNull();
    expect(groupKeyForVersion).not.toHaveBeenCalled();
  });
});

const render = (msg: Message, isOwn = false) => renderHook(() => useDecryptedMedia(msg, isOwn));

describe('useDecryptedMedia', () => {
  it('shows nothing when the message carries no media', async () => {
    const { result } = render(message({}));
    await waitFor(() => expect(result.current).toBeNull());
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('shows the stored file directly when there is nothing to decrypt', async () => {
    const { result } = render(message({ media_url: '/uploads/plain.png' }));
    await waitFor(() => expect(result.current).toBe('http://localhost:8080/uploads/plain.png'));
    expect(decryptFile).not.toHaveBeenCalled();
  });

  it('leaves an absolute URL alone and makes a relative one absolute', async () => {
    const absolute = render(message({ media_url: 'https://cdn.example/x.png' }));
    await waitFor(() => expect(absolute.result.current).toBe('https://cdn.example/x.png'));

    const relative = render(message({ media_url: 'uploads/y.png' }));
    await waitFor(() =>
      expect(relative.result.current).toBe('http://localhost:8080/uploads/y.png')
    );
  });

  it('decrypts an encrypted file and shows the result', async () => {
    const { result } = render(message({ media_url: '/u/a.png', ...ENCRYPTED }));
    await waitFor(() => expect(result.current).toBe('blob:decrypted'));
  });

  // The upload is application/octet-stream, so the blob's type can only come
  // from the name. Getting it wrong means the browser will not render the file.
  it.each([
    ['/u/a.png', 'image/png'],
    ['/u/a.jpg', 'image/jpeg'],
    ['/u/a.jpeg', 'image/jpeg'],
    ['/u/a.gif', 'image/gif'],
    ['/u/a.webp', 'image/webp'],
    ['/u/a.mp4', 'video/mp4'],
    ['/u/a.webm', 'video/webm'],
    ['/u/a.mp3', 'audio/mpeg'],
    ['/u/a.wav', 'audio/wav'],
    ['/u/a.ogg', 'audio/ogg'],
    ['/u/a.PNG', 'image/png'],
    ['/u/a.bin', 'application/octet-stream'],
    ['/u/noextension', 'application/octet-stream'],
    ['/my.files/a', 'application/octet-stream'],
    // A query string defeats the extension, in both copies this replaced. Kept
    // as a record of what happens, not as an endorsement.
    ['/u/a.png?v=2', 'application/octet-stream'],
  ])('reads the type of %s as %s', async (media_url, expected) => {
    const { result } = render(message({ media_url, ...ENCRYPTED }));
    await waitFor(() => expect(result.current).toBe('blob:decrypted'));
    expect(vi.mocked(decryptFile).mock.calls[0][0].mimeType).toBe(expected);
  });

  it('opens the sender their own copy when they have one', async () => {
    const mine = message({
      media_url: '/u/a.png',
      media_encryption_key: 'KEY-FOR-RECIPIENT',
      sender_media_encryption_key: 'KEY-FOR-ME',
      media_encryption_iv: 'IV',
    });
    const { result } = render(mine, true);
    await waitFor(() => expect(result.current).toBe('blob:decrypted'));
    expect(vi.mocked(decryptFile).mock.calls[0][0].encryptedKey).toBe('KEY-FOR-ME');
  });

  it('falls back to the recipient copy when the sender kept none', async () => {
    const { result } = render(message({ media_url: '/u/a.png', ...ENCRYPTED }), true);
    await waitFor(() => expect(result.current).toBe('blob:decrypted'));
    expect(vi.mocked(decryptFile).mock.calls[0][0].encryptedKey).toBe('KEY-FOR-RECIPIENT');
  });

  it.each([
    ['there is a key but no iv', { media_encryption_key: 'KEY-FOR-RECIPIENT' }],
    ['there is an iv but no key', { media_encryption_iv: 'IV' }],
  ])('shows the stored file when %s', async (_name, partial) => {
    const { result } = render(message({ media_url: '/u/a.png', ...partial }));
    await waitFor(() => expect(result.current).toBe('http://localhost:8080/u/a.png'));
    expect(decryptFile).not.toHaveBeenCalled();
  });

  it.each([
    ['this device holds no keys', () => vi.mocked(getOwnKeys).mockResolvedValue(null)],
    [
      'the file cannot be fetched',
      () =>
        vi.mocked(authenticatedFetch).mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'boom',
        } as never),
    ],
    ['decryption fails', () => vi.mocked(decryptFile).mockRejectedValue(new Error('bad key'))],
  ])('shows the stored file when %s', async (_name, arrange) => {
    arrange();
    const { result } = render(message({ media_url: '/u/a.png', ...ENCRYPTED }));
    await waitFor(() => expect(result.current).toBe('http://localhost:8080/u/a.png'));
  });

  it('releases the blob it made when the message goes away', async () => {
    const { result, unmount } = render(message({ media_url: '/u/a.png', ...ENCRYPTED }));
    await waitFor(() => expect(result.current).toBe('blob:decrypted'));

    unmount();

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:decrypted');
  });

  // The test above unmounts after the decrypt has landed, which is the case that
  // always worked. This one unmounts while it is still running: the effect's
  // cleanup has then already run, so a blob URL made afterwards is held for the
  // life of the page -- one whole decrypted file per file the reader scrolls
  // past mid-decrypt.
  it('releases the blob when the reader scrolls away before the decrypt lands', async () => {
    let release: (blob: Blob) => void = () => {};
    vi.mocked(decryptFile).mockReturnValue(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }) as never
    );

    const { unmount } = render(message({ media_url: '/u/a.png', ...ENCRYPTED }));
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalled());

    unmount();
    release(new Blob(['plain']));
    await waitFor(() =>
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:decrypted')
    );
    expect(vi.mocked(globalThis.URL.createObjectURL).mock.calls).toHaveLength(1);
  });
});
