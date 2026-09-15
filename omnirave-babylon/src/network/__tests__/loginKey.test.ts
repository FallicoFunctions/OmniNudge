import { describe, expect, it } from 'vitest';

import vectors from '../../../../shared/crypto-vectors/login-keys.json';
import { deriveLoginKey, newKdfSalt } from '../loginKey';

// The main app and this runtime must derive the same login key from the same
// password, or an account could sign in on one and not the other. The vectors
// were computed by an independent implementation (Node's crypto).
describe('deriveLoginKey', () => {
  it.each(vectors.passwords)('matches the shared vector for "$password"', async (vector) => {
    await expect(deriveLoginKey(vector.password, vector.salt, vector.iterations)).resolves.toBe(vector.loginKey);
  });

  it('depends on the salt', async () => {
    const [vector] = vectors.passwords;
    const other = await deriveLoginKey(vector.password, btoa('fedcba9876543210'), vector.iterations);
    expect(other).not.toBe(vector.loginKey);
  });
});

describe('newKdfSalt', () => {
  it('makes a fresh 16-byte salt each time', () => {
    const salt = newKdfSalt();
    expect(atob(salt)).toHaveLength(16);
    expect(newKdfSalt()).not.toBe(salt);
  });
});
