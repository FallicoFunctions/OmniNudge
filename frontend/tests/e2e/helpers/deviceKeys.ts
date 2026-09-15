import { generateKeyPairSync } from 'node:crypto';
import type { Page } from '@playwright/test';

// A signed-in browser in these tests stands for a device that already holds
// the account's message key. Without one, AuthContext opens a full-screen key
// step (the phrase, the password or a retry) over the whole app, as it does on
// a real new device, and every click in the test lands on it instead.
//
// The key pair is RSA-OAEP 2048, as the app makes it. The private key goes in
// the legacy localStorage slot, which getOwnKeys imports into IndexedDB as a
// non-extractable key on first use; the public key must match the account's
// public_key exactly, or the device key counts as an old one.
export async function seedDeviceMessageKey(page: Page): Promise<string> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const privateKeyBase64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  await page.addInitScript(
    ([pub, priv]) => {
      window.localStorage.setItem('omninudge_public_key', pub);
      window.localStorage.setItem('omninudge_private_key', priv);
    },
    [publicKeyBase64, privateKeyBase64]
  );
  return publicKeyBase64;
}

// GET /auth/key-backup for an account that signs in with a login key.
export const LOGIN_KEY_ACCOUNT_BACKUP = {
  auth_scheme: 2,
  has_password: true,
  kdf_salt: 'MDEyMzQ1Njc4OWFiY2RlZg==',
  kdf_iterations: 600000,
  encrypted_private_key: '{"v":1,"iv":"AAECAwQFBgcICQoL","data":"AA=="}',
  recovery_wrapped_private_key: '{"v":1,"iv":"AAECAwQFBgcICQoL","data":"AA=="}',
};
