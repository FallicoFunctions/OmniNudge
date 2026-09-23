/**
 * The public key rebuilt from a private key, with real RSA keys.
 *
 * A device once stored an account's private key beside a public key published
 * by an old build for a different pair. Nothing compared them, so the device
 * could open neither its own sender copies nor anything sent to it. The pair is
 * now rebuilt from the private key; this pins that the rebuild is exact.
 */
import { describe, expect, it } from 'vitest';
import { publicKeyOf } from '../keyManagementService';
import { exportKeyPair, generateKeyPair } from '../../utils/encryption';

describe('publicKeyOf', () => {
  it('rebuilds exactly the public key that was generated with the private key', async () => {
    const pair = await exportKeyPair(await generateKeyPair());
    expect(await publicKeyOf(pair.privateKey)).toBe(pair.publicKey);
  });

  it('tells two pairs apart, which is what finds a mismatched account', async () => {
    const mine = await exportKeyPair(await generateKeyPair());
    const orphaned = await exportKeyPair(await generateKeyPair());
    expect(await publicKeyOf(mine.privateKey)).not.toBe(orphaned.publicKey);
  });
});
