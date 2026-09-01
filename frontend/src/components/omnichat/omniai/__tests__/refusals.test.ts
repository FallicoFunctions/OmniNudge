import { describe, expect, it } from 'vitest';

import { refusalFrom, serverErrorFrom } from '../refusals';

/** What the interceptor actually rejects with: a raw AxiosError. */
function axiosError(status: number, data: Record<string, unknown>) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    code: status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    status,
    response: { status, data },
  });
}

describe('reading what the server said', () => {
  it('takes the code from the body, not from axios', () => {
    // error.code is axios's own. Reading it found "ERR_BAD_REQUEST" every time.
    const read = serverErrorFrom(axiosError(400, { code: 'omniai_underage', message: 'Characters must be 18 or older.' }));
    expect(read.code).toBe('omniai_underage');
    expect(read.status).toBe(400);
    expect(read.message).toBe('Characters must be 18 or older.');
  });

  it('still reads a body that names the field "error"', () => {
    expect(serverErrorFrom(axiosError(400, { error: 'She needs a name.' })).message).toBe(
      'She needs a name.'
    );
  });

  it('accepts an already-unwrapped shape', () => {
    expect(serverErrorFrom({ code: 'omniai_already_exists', status: 409 }).code).toBe(
      'omniai_already_exists'
    );
  });

  it('reports nothing rather than axios boilerplate when the body is empty', () => {
    const read = serverErrorFrom(axiosError(500, {}));
    expect(read.message).toBeUndefined();
    expect(read.code).toBeUndefined();
    expect(read.status).toBe(500);
  });
});

describe('turning a refusal into an offer', () => {
  it('separates the two 400s the status alone cannot', () => {
    expect(refusalFrom(axiosError(400, { code: 'omniai_underage' }))).toBe('underage');
    expect(refusalFrom(axiosError(400, { code: 'omniai_name_invalid' }))).toBeNull();
  });

  it('reads the coded refusals off a real error', () => {
    expect(refusalFrom(axiosError(409, { code: 'omniai_already_exists' }))).toBe('already_has_one');
    expect(refusalFrom(axiosError(403, { code: 'omniai_requires_upgrade' }))).toBe('needs_upgrade');
  });

  it('falls back to the status when a proxy ate the body', () => {
    expect(refusalFrom(axiosError(409, {}))).toBe('already_has_one');
    expect(refusalFrom(axiosError(403, {}))).toBe('needs_upgrade');
  });
});
