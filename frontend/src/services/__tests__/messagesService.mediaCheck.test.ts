/**
 * A send with a file waits for the server's security scan.
 *
 * The server scans an upload after storing it and answers 423 until the scan
 * passes. The composer sends the moment the upload returns, so in a real browser
 * the first attempt was refused almost every time and the send failed without a
 * word. These tests drive the refusal the server really gives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApi } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../lib/api', () => ({ api: mockApi }));
vi.mock('../keyManagementService', () => ({
  getUserPublicKey: vi.fn(async () => ({})),
  getOwnKeys: vi.fn(async () => ({ privateKey: {}, publicKey: {} })),
  getOwnPublicKeyBase64: vi.fn(() => 'this-device'),
}));

import { MEDIA_CHECK_WAIT_MS, messagesService } from '../messagesService';
import { MessageNotSent, messageSendErrorKey } from '../../utils/messageSendErrors';

const refused = (status: number) =>
  Object.assign(new Error('File is not available until security scanning completes'), {
    status,
  });

const directConversation = { id: 4, conversation_type: 'direct', other_user: { id: 2 } };
const withFile = { conversation_id: 4, media_file_id: 77, message_type: 'image' as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockApi.get.mockResolvedValue(directConversation);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sending a file before its scan has passed', () => {
  it('waits, then sends the same request once the file is clean', async () => {
    mockApi.post
      .mockRejectedValueOnce(refused(423))
      .mockRejectedValueOnce(refused(423))
      .mockResolvedValueOnce({ id: 1 });
    const onWaiting = vi.fn();

    const sent = messagesService.sendMessage(withFile, { onWaitingForMediaCheck: onWaiting });
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(sent).resolves.toEqual({ id: 1 });
    expect(mockApi.post).toHaveBeenCalledTimes(3);
    const bodies = mockApi.post.mock.calls.map((call) => JSON.stringify(call[1]));
    expect(new Set(bodies).size).toBe(1);
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it('gives up with a reason the person can read, after a bounded number of tries', async () => {
    mockApi.post.mockRejectedValue(refused(423));

    const sent = messagesService.sendMessage(withFile).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(MEDIA_CHECK_WAIT_MS + 5_000);
    const error = await sent;

    expect(error).toBeInstanceOf(MessageNotSent);
    expect((error as MessageNotSent).refusal).toBe('media-still-checking');
    expect(messageSendErrorKey(error)).toBe('messages.errors.mediaStillChecking');
    // The send is rate limited (60 a minute); the wait must not spend it.
    expect(mockApi.post.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('does not wait on a 423 when no file is attached', async () => {
    mockApi.post.mockRejectedValue(refused(423));

    const sent = messagesService
      .sendMessage({ conversation_id: 4, encrypted_content: 'x', encryption_version: 'v2' })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(((await sent) as { status?: number }).status).toBe(423);
    expect(mockApi.post).toHaveBeenCalledTimes(1);
  });

  it('does not retry any other refusal', async () => {
    mockApi.post.mockRejectedValue(refused(429));

    const sent = messagesService.sendMessage(withFile).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(messageSendErrorKey(await sent)).toBe('messages.errors.sendingTooFast');
    expect(mockApi.post).toHaveBeenCalledTimes(1);
  });
});
