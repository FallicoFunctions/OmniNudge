/**
 * The request body uploadMedia actually sends.
 *
 * The server sniffs an upload's bytes to learn its type and refuses anything
 * that is not media -- and ciphertext never sniffs as media. So the only way an
 * encrypted file is accepted is the encrypted field in this body. Every
 * encrypted file a client sent before that field existed was refused with 415.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api';
import { mediaService } from '../mediaService';

vi.mock('../api', () => ({
  default: { post: vi.fn(async () => ({ data: { id: 1 } })) },
}));

const sent = (): FormData => vi.mocked(api.post).mock.calls.at(-1)![1] as FormData;

beforeEach(() => vi.clearAllMocks());

describe('mediaService.uploadMedia', () => {
  it('tells the server an encrypted file cannot be inspected', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    await mediaService.uploadMedia(file, { encrypted: true });

    expect(sent().get('encrypted')).toBe('true');
    expect((sent().get('file') as File).name).toBe('photo.png');
  });

  it('sends no such field for a plain upload, so the server still inspects it', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    await mediaService.uploadMedia(file);

    expect(sent().get('encrypted')).toBeNull();
  });
});
