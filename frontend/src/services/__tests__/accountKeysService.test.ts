import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { saveKeys, storeNonExtractablePrivateKey } from '../keyManagementService';
import { encryptPrivateKeyWithPassword } from '../keySyncService';
import { deriveLoginKeys, unwrapSecret, wrapSecret } from '../../utils/loginKeys';
import {
  deriveRecoveryKey,
  isValidRecoveryPhrase,
  newRecoveryPhrase,
} from '../../utils/recoveryPhrase';
import {
  createAccountKeys,
  moveAccount,
  prepareSignUp,
  recoverWithPhrase,
  signInSecret,
  unlockAfterSignIn,
} from '../accountKeysService';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../keyManagementService', () => ({
  saveKeys: vi.fn(),
  storeNonExtractablePrivateKey: vi.fn(),
}));

const salt = btoa('0123456789abcdef');
// Few rounds where the server's settings are the test's own; the flows that
// pick their own settings use the real 600,000.
const FEW_ROUNDS = 1000;

type Body = Record<string, unknown>;
const bodiesSentTo = (method: 'put' | 'post', path: string): Body[] =>
  vi
    .mocked(api[method])
    .mock.calls.filter(([p]) => p === path)
    .map(([, body]) => body as Body);

function serverAnswers(responses: Record<string, unknown>) {
  vi.mocked(api.get).mockImplementation(async (path: string) => responses[path] as never);
}

// reset, not clear: the failure tests give the mocks implementations that must
// not leak into the next test.
beforeEach(() => {
  vi.resetAllMocks();
});

const callOrder = (method: 'put' | 'post', path: string) => {
  const mock = vi.mocked(api[method]).mock;
  return mock.invocationCallOrder[mock.calls.findIndex(([p]) => p === path)];
};

describe('sign-up', () => {
  it('stores a key pair whose two copies open to the same private key, never sent in plain', async () => {
    const { keys } = await prepareSignUp('correct horse');
    const phrase = await createAccountKeys(keys);
    expect(isValidRecoveryPhrase(phrase)).toBe(true);

    const [published] = bodiesSentTo('put', '/auth/public-key');
    expect(published.login_key).toBe(keys.loginKey);
    const [copy] = bodiesSentTo('put', '/auth/encrypted-private-key');
    const [recovery] = bodiesSentTo('put', '/auth/recovery-key');
    expect(copy.login_key).toBe(keys.loginKey);
    expect(recovery.login_key).toBe(keys.loginKey);

    const underPassword = await unwrapSecret(copy.encrypted_private_key as string, keys.wrapKey);
    const underPhrase = await unwrapSecret(
      recovery.recovery_wrapped_private_key as string,
      await deriveRecoveryKey(phrase)
    );
    expect(underPhrase).toBe(underPassword);
    expect(JSON.stringify(vi.mocked(api.put).mock.calls)).not.toContain(underPassword);
    expect(saveKeys).toHaveBeenCalledOnce();
  });

  it('publishes the public key only after both copies and the device hold the private key', async () => {
    const { keys } = await prepareSignUp('correct horse');
    await createAccountKeys(keys);
    const publicKeyAt = callOrder('put', '/auth/public-key');
    expect(publicKeyAt).toBeGreaterThan(callOrder('put', '/auth/encrypted-private-key'));
    expect(publicKeyAt).toBeGreaterThan(callOrder('put', '/auth/recovery-key'));
    expect(publicKeyAt).toBeGreaterThan(vi.mocked(saveKeys).mock.invocationCallOrder[0]);
  });

  it('publishes no public key when a copy fails to upload', async () => {
    const { keys } = await prepareSignUp('correct horse');
    vi.mocked(api.put).mockImplementation(async (path: string) => {
      if (path === '/auth/recovery-key') throw new Error('offline');
      return undefined as never;
    });
    await expect(createAccountKeys(keys)).rejects.toThrow('offline');
    expect(bodiesSentTo('put', '/auth/public-key')).toHaveLength(0);
    expect(saveKeys).not.toHaveBeenCalled();
  });

  it('gives an account with no password only the recovery copy', async () => {
    await createAccountKeys(null);
    expect(bodiesSentTo('put', '/auth/encrypted-private-key')).toHaveLength(0);
    const [recovery] = bodiesSentTo('put', '/auth/recovery-key');
    expect(recovery).not.toHaveProperty('login_key');
    const [published] = bodiesSentTo('put', '/auth/public-key');
    expect(published).not.toHaveProperty('login_key');
  });
});

describe('sign-in', () => {
  it('sends a login key derived with the server salt, and never the password, on scheme 2', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      scheme: 2,
      kdf_salt: salt,
      kdf_iterations: FEW_ROUNDS,
    });
    const secret = await signInSecret('keyholder', 'correct horse');
    const expected = await deriveLoginKeys('correct horse', salt, FEW_ROUNDS);
    expect(secret).toMatchObject({ scheme: 2, login_key: expected.loginKey });
    expect(secret).not.toHaveProperty('password');
  });

  it('never falls back to the password when a scheme 2 answer lacks its settings', async () => {
    for (const answer of [{ scheme: 2 }, { scheme: 2, kdf_salt: salt }, { scheme: 3 }]) {
      vi.mocked(api.post).mockResolvedValueOnce(answer);
      await expect(signInSecret('keyholder', 'correct horse')).rejects.toThrow(
        'Sign-in settings are missing'
      );
    }
  });

  it('sends the password on scheme 1', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ scheme: 1 });
    expect(await signInSecret('oldschool', 'correct horse')).toEqual({
      scheme: 1,
      password: 'correct horse',
    });
  });

  it('unlocks the private key from the copy the wrap key opens', async () => {
    const keys = await deriveLoginKeys('correct horse', salt, FEW_ROUNDS);
    serverAnswers({
      '/auth/key-backup': {
        encrypted_private_key: await wrapSecret('the-private-key', keys.wrapKey),
      },
    });
    expect(await unlockAfterSignIn(keys, 'the-public-key')).toBe('unlocked');
    expect(storeNonExtractablePrivateKey).toHaveBeenCalledWith('the-private-key', 'the-public-key');
  });

  it('asks for the phrase, and makes nothing, when the copy is missing or does not open', async () => {
    const keys = await deriveLoginKeys('correct horse', salt, FEW_ROUNDS);
    const other = await deriveLoginKeys('another password', salt, FEW_ROUNDS);
    for (const backup of [
      {},
      { encrypted_private_key: await wrapSecret('the-private-key', other.wrapKey) },
    ]) {
      serverAnswers({ '/auth/key-backup': backup });
      expect(await unlockAfterSignIn(keys, 'the-public-key')).toBe('needs-recovery');
    }
    expect(storeNonExtractablePrivateKey).not.toHaveBeenCalled();
    expect(saveKeys).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('the move from the old scheme', () => {
  it('rewraps the existing private key under the new key and a new phrase', async () => {
    serverAnswers({
      '/auth/encrypted-private-key': {
        encrypted_private_key: await encryptPrivateKeyWithPassword(
          'the-private-key',
          'old-password'
        ),
      },
    });
    const result = await moveAccount('old-password', 'the-public-key');
    if (result.status !== 'moved') throw new Error(`unexpected ${result.status}`);

    const [move] = bodiesSentTo('post', '/auth/login-key');
    expect(move).toMatchObject({
      current_password: 'old-password',
      login_key: result.keys.loginKey,
      kdf_iterations: 600000,
    });
    await expect(
      unwrapSecret(move.encrypted_private_key as string, result.keys.wrapKey)
    ).resolves.toBe('the-private-key');
    const [recovery] = bodiesSentTo('put', '/auth/recovery-key');
    expect(recovery).toMatchObject({ password: 'old-password' });
    expect(recovery).not.toHaveProperty('login_key');
    await expect(
      unwrapSecret(
        recovery.recovery_wrapped_private_key as string,
        await deriveRecoveryKey(result.recoveryPhrase)
      )
    ).resolves.toBe('the-private-key');
    expect(callOrder('put', '/auth/recovery-key')).toBeLessThan(
      callOrder('post', '/auth/login-key')
    );
    expect(storeNonExtractablePrivateKey).toHaveBeenCalledWith('the-private-key', 'the-public-key');
  });

  it('does not move the account when the phrase copy fails to upload', async () => {
    serverAnswers({
      '/auth/encrypted-private-key': {
        encrypted_private_key: await encryptPrivateKeyWithPassword(
          'the-private-key',
          'old-password'
        ),
      },
    });
    vi.mocked(api.put).mockRejectedValueOnce(new Error('offline'));
    await expect(moveAccount('old-password', 'the-public-key')).rejects.toThrow('offline');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('reports an account with no old copy instead of moving it', async () => {
    serverAnswers({ '/auth/encrypted-private-key': { encrypted_private_key: null } });
    expect(await moveAccount('old-password', 'the-public-key')).toEqual({
      status: 'no-exportable-key',
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('refuses a wrong password and sends nothing', async () => {
    serverAnswers({
      '/auth/encrypted-private-key': {
        encrypted_private_key: await encryptPrivateKeyWithPassword(
          'the-private-key',
          'old-password'
        ),
      },
    });
    await expect(moveAccount('wrong-password', 'the-public-key')).rejects.toThrow();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('recovery with the phrase', () => {
  it('opens the recovery copy and wraps the key again under the new password', async () => {
    const phrase = newRecoveryPhrase();
    const keys = await deriveLoginKeys('new password', salt, FEW_ROUNDS);
    serverAnswers({
      '/auth/key-backup': {
        recovery_wrapped_private_key: await wrapSecret(
          'the-private-key',
          await deriveRecoveryKey(phrase)
        ),
      },
    });
    await recoverWithPhrase(phrase, keys, 'the-public-key');

    const [copy] = bodiesSentTo('put', '/auth/encrypted-private-key');
    expect(copy.login_key).toBe(keys.loginKey);
    await expect(unwrapSecret(copy.encrypted_private_key as string, keys.wrapKey)).resolves.toBe(
      'the-private-key'
    );
    expect(storeNonExtractablePrivateKey).toHaveBeenCalledWith('the-private-key', 'the-public-key');
  });

  it('refuses a wrong phrase or a missing recovery copy and uploads nothing', async () => {
    const keys = await deriveLoginKeys('new password', salt, FEW_ROUNDS);
    serverAnswers({
      '/auth/key-backup': {
        recovery_wrapped_private_key: await wrapSecret(
          'the-private-key',
          await deriveRecoveryKey(newRecoveryPhrase())
        ),
      },
    });
    await expect(recoverWithPhrase(newRecoveryPhrase(), keys, 'the-public-key')).rejects.toThrow();
    serverAnswers({ '/auth/key-backup': {} });
    await expect(recoverWithPhrase(newRecoveryPhrase(), keys, 'the-public-key')).rejects.toThrow(
      'This account has no recovery copy'
    );
    expect(api.put).not.toHaveBeenCalled();
    expect(storeNonExtractablePrivateKey).not.toHaveBeenCalled();
  });
});
