/**
 * The account-key flows of the login-key scheme. The server never gets the
 * password: sign-in sends a login key derived on the device, and the private
 * key travels only wrapped, by the password's wrap key or by the recovery
 * phrase. Nothing here makes keys on its own: a copy that is missing or does
 * not open is reported, and new keys come only from sign-up or an explicit
 * start-fresh.
 *
 * These functions hold no sign-in state; AuthContext calls them.
 */
import { api } from '../lib/api';
import type { KeyBackup, PreLoginResponse } from '../types/auth';
import { encryptionService } from './encryptionService';
import { saveKeys, storeNonExtractablePrivateKey } from './keyManagementService';
import { decryptPrivateKeyWithPassword } from './keySyncService';
import { exportKeyPair, generateKeyPair } from '../utils/encryption';
import {
  DEFAULT_KDF_ITERATIONS,
  deriveLoginKeys,
  newKdfSalt,
  unwrapSecret,
  wrapSecret,
  type LoginKeys,
} from '../utils/loginKeys';
import { deriveRecoveryKey, newRecoveryPhrase } from '../utils/recoveryPhrase';

/** The KDF settings a new login key is derived with. */
export interface KdfSettings {
  kdf_salt: string;
  kdf_iterations: number;
}

/** What to send to sign in, and the wrap key when there is one. */
export type SignInSecret =
  | { scheme: 2; login_key: string; keys: LoginKeys }
  | { scheme: 1; password: string };

export type UnlockResult = 'unlocked' | 'needs-recovery';

export type MoveResult =
  | { status: 'moved'; recoveryPhrase: string; keys: LoginKeys }
  | { status: 'no-exportable-key' };

/** Asks the server how this account proves its password, and derives the proof. */
export async function signInSecret(username: string, password: string): Promise<SignInSecret> {
  const pre = await api.post<PreLoginResponse>('/auth/prelogin', { username });
  if (pre.scheme === 1) {
    return { scheme: 1, password };
  }
  // Anything else must not fall back to sending the password, which is
  // exactly what a login-key account never does.
  if (pre.scheme !== 2 || !pre.kdf_salt || !pre.kdf_iterations) {
    throw new Error('Sign-in settings are missing');
  }
  const keys = await deriveLoginKeys(password, pre.kdf_salt, pre.kdf_iterations);
  return { scheme: 2, login_key: keys.loginKey, keys };
}

/** The login key and settings for a new account's sign-up request. */
export async function prepareSignUp(password: string): Promise<{ keys: LoginKeys } & KdfSettings> {
  const settings: KdfSettings = { kdf_salt: newKdfSalt(), kdf_iterations: DEFAULT_KDF_ITERATIONS };
  const keys = await deriveLoginKeys(password, settings.kdf_salt, settings.kdf_iterations);
  return { keys, ...settings };
}

/**
 * Proves the account when storing a recovery copy: its login key, its
 * password while it still has the old scheme, or nothing for an account with
 * no password at all.
 */
export type AccountProof = { login_key: string } | { password: string } | Record<string, never>;

/**
 * Gives a signed-up (or starting-fresh) account a key pair: the copy wrapped
 * by the password's wrap key and the copy wrapped by a new recovery phrase go
 * to the server, the private key stays on the device, and the public key is
 * published last. keys is null for an account with no password (provider
 * sign-in only). Returns the phrase, which the user must write down.
 */
export async function createAccountKeys(keys: LoginKeys | null): Promise<string> {
  const keyPair = await generateKeyPair();
  const exported = await exportKeyPair(keyPair);
  if (keys) {
    await encryptionService.uploadEncryptedPrivateKey(
      await wrapSecret(exported.privateKey, keys.wrapKey),
      keys.loginKey
    );
  }
  const recoveryPhrase = await storeRecoveryCopy(
    exported.privateKey,
    keys ? { login_key: keys.loginKey } : {}
  );
  await saveKeys(keyPair);
  // Others encrypt to the public key, so it goes out only once its private key
  // is kept on the device and on the server: a failure part-way leaves no key
  // that messages are sent to and nobody holds.
  await encryptionService.uploadPublicKey(exported.publicKey, keys?.loginKey);
  return recoveryPhrase;
}

/** A new phrase, and the private key wrapped by it on the server. */
export async function storeRecoveryCopy(privateKey: string, proof: AccountProof): Promise<string> {
  const recoveryPhrase = newRecoveryPhrase();
  const copy = await wrapSecret(privateKey, await deriveRecoveryKey(recoveryPhrase));
  await api.put('/auth/recovery-key', { recovery_wrapped_private_key: copy, ...proof });
  return recoveryPhrase;
}

/**
 * After a scheme 2 sign-in, opens the copy wrapped by the password's wrap key
 * and keeps the private key on the device. A missing copy (after a reset) or
 * one that does not open needs the recovery phrase.
 */
export async function unlockAfterSignIn(keys: LoginKeys, publicKey: string): Promise<UnlockResult> {
  const backup = await api.get<KeyBackup>('/auth/key-backup');
  if (!backup.encrypted_private_key) {
    return 'needs-recovery';
  }
  try {
    const privateKey = await unwrapSecret(backup.encrypted_private_key, keys.wrapKey);
    await storeNonExtractablePrivateKey(privateKey, publicKey);
    return 'unlocked';
  } catch {
    return 'needs-recovery';
  }
}

/**
 * Moves a signed-in scheme 1 account to a login key. The old copy on the
 * server, wrapped with the password, is opened once; the private key is
 * wrapped again under the new wrap key and a new recovery phrase, and the
 * move replaces the old copy. An account with no old copy has no key the
 * browser can export, and starts fresh instead.
 */
export async function moveAccount(password: string, publicKey: string): Promise<MoveResult> {
  const oldCopy = await encryptionService.getEncryptedPrivateKey();
  if (!oldCopy) {
    return { status: 'no-exportable-key' };
  }
  const privateKey = await decryptPrivateKeyWithPassword(oldCopy, password);
  // The phrase copy goes first, proved with the password the account still
  // signs in with: if the move then fails the account is unchanged, and it is
  // never moved without a phrase.
  const recoveryPhrase = await storeRecoveryCopy(privateKey, { password });
  const settings: KdfSettings = { kdf_salt: newKdfSalt(), kdf_iterations: DEFAULT_KDF_ITERATIONS };
  const keys = await deriveLoginKeys(password, settings.kdf_salt, settings.kdf_iterations);
  await api.post('/auth/login-key', {
    current_password: password,
    login_key: keys.loginKey,
    ...settings,
    encrypted_private_key: await wrapSecret(privateKey, keys.wrapKey),
  });
  await storeNonExtractablePrivateKey(privateKey, publicKey);
  return { status: 'moved', recoveryPhrase, keys };
}

/**
 * Moves a scheme 1 account with no old copy to a login key, with no private
 * key copy yet: the caller starts fresh with the returned keys.
 */
export async function moveWithoutKey(password: string): Promise<LoginKeys> {
  const settings: KdfSettings = { kdf_salt: newKdfSalt(), kdf_iterations: DEFAULT_KDF_ITERATIONS };
  const keys = await deriveLoginKeys(password, settings.kdf_salt, settings.kdf_iterations);
  await api.post('/auth/login-key', {
    current_password: password,
    login_key: keys.loginKey,
    ...settings,
  });
  return keys;
}

/**
 * Opens the recovery copy with the phrase and keeps the private key on the
 * device. An account with a password also gets the key wrapped again under
 * the current wrap key, which a reset left without a copy; keys is null for
 * an account with no password. Throws on a wrong phrase or no recovery copy.
 */
export async function recoverWithPhrase(
  phrase: string,
  keys: LoginKeys | null,
  publicKey: string
): Promise<void> {
  const backup = await api.get<KeyBackup>('/auth/key-backup');
  if (!backup.recovery_wrapped_private_key) {
    throw new Error('This account has no recovery copy');
  }
  const privateKey = await unwrapSecret(
    backup.recovery_wrapped_private_key,
    await deriveRecoveryKey(phrase)
  );
  if (keys) {
    await encryptionService.uploadEncryptedPrivateKey(
      await wrapSecret(privateKey, keys.wrapKey),
      keys.loginKey
    );
  }
  await storeNonExtractablePrivateKey(privateKey, publicKey);
}
