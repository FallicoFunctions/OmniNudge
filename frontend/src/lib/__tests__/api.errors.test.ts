import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedFetch } from '../../services/authSession';
import { api, type ApiRequestError } from '../api';

vi.mock('../../services/authSession', () => ({ authenticatedFetch: vi.fn() }));

// A private hub's real answer: more than a message, a status and a code.
const privateHub = {
  error: 'This hub is private and you do not have access',
  hub_name: 'secret',
  privacy_type: 'private',
  access_required: true,
};

const answer = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.mocked(authenticatedFetch).mockReset();
});

describe('a failed request', () => {
  // The client kept the message, status and code, and dropped every other
  // field, so the hub page could not see access_required.
  it('keeps the whole body on the error', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(answer(403, privateHub));

    const error = (await api.get('/hubs/secret/posts').catch((e) => e)) as ApiRequestError;

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('This hub is private and you do not have access');
    expect(error.status).toBe(403);
    expect(error.body.access_required).toBe(true);
    expect(error.body.privacy_type).toBe('private');
  });

  // The upload path built its own error and dropped the status and code.
  it('carries the status and code from an upload too', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      answer(413, { error: 'File too large', code: 'payload_too_large', message: 'File too large' })
    );

    const error = (await api
      .uploadFile('/users/me/avatar', new File(['x'], 'a.png'))
      .catch((e) => e)) as ApiRequestError;

    expect(error.message).toBe('File too large');
    expect(error.status).toBe(413);
    expect(error.code).toBe('payload_too_large');
  });
});
