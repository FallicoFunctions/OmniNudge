// Test vectors for the login-key scheme, computed with Node's own crypto: a
// different implementation from the browser's WebCrypto, so a client that
// matches them derives the same keys as every other client, not merely the
// same keys as itself.
//
//   node shared/crypto-vectors/generate.mjs > shared/crypto-vectors/login-keys.json
//
// The scheme:
//   master      = PBKDF2-HMAC-SHA256(NFKC(password), salt, iterations, 32 bytes)
//   loginKey    = HKDF-SHA256(master, empty salt, "omninudge/login-key/v1", 32)   sent, base64
//   wrapKey     = HKDF-SHA256(master, empty salt, "omninudge/wrap-key/v1", 32)    AES-256-GCM, kept
//   recoveryKey = HKDF-SHA256(BIP-39 entropy, empty salt, "omninudge/recovery-key/v1", 32)
//   wrapped     = JSON {"v":1,"iv":base64(12 bytes),"data":base64(ciphertext || tag)}
import { createCipheriv, hkdfSync, pbkdf2Sync } from 'node:crypto';

const info = {
  login: 'omninudge/login-key/v1',
  wrap: 'omninudge/wrap-key/v1',
  recovery: 'omninudge/recovery-key/v1',
};
const hkdf = (ikm, label) => Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), label, 32));
const iv = Buffer.from('000102030405060708090a0b', 'hex');
const plaintext = 'private-key-under-test';
const wrap = (key) => {
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), data: data.toString('base64') });
};

const passwords = [
  { password: 'correct horse battery staple', salt: Buffer.from('0123456789abcdef').toString('base64'), iterations: 600000 },
  // Composed and decomposed forms must meet: NFKC before hashing.
  { password: 'Pässwörd ✓', salt: Buffer.from('fedcba9876543210fedcba98').toString('base64'), iterations: 600000 },
].map((v) => {
  const master = pbkdf2Sync(Buffer.from(v.password.normalize('NFKC'), 'utf8'), Buffer.from(v.salt, 'base64'), v.iterations, 32, 'sha256');
  return { ...v, loginKey: hkdf(master, info.login).toString('base64'), wrapped: wrap(hkdf(master, info.wrap)) };
});

// Official BIP-39 English vectors: each phrase must map to this entropy.
const phrases = [
  { phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', entropy: '00000000000000000000000000000000' },
  { phrase: 'legal winner thank year wave sausage worth useful legal winner thank yellow', entropy: '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f' },
].map((v) => ({ ...v, wrapped: wrap(hkdf(Buffer.from(v.entropy, 'hex'), info.recovery)) }));

process.stdout.write(JSON.stringify({ info, plaintext, passwords, phrases }, null, 2) + '\n');
