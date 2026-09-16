// Test vectors for the group-key scheme, computed with Node's own crypto: a
// different implementation from the browser's WebCrypto, so a client that
// matches them seals what every other client can open.
//
//   node shared/crypto-vectors/generate-group-keys.mjs > shared/crypto-vectors/group-keys.json
//
// This is a sibling of generate.mjs rather than a second mode of it. That
// script's one documented redirect writes login-keys.json, which the frontend,
// both OmniRave runtimes and scripts/derive-login-key.mjs all read by name.
//
// The scheme:
//   A group has one AES-256-GCM key per numbered version. The server stores
//   only per-member copies of it, each wrapped with that member's RSA-OAEP
//   public key, and never the key itself.
//
//   sealed = JSON {"v":1,"k":<key version>,"iv":base64(12 bytes),
//                  "data":base64(ciphertext || tag)}
//
// A random key cannot be pinned, so these fix the key, the IV and the
// plaintext, and pin the bytes that come out. The IV is fixed HERE and only
// here: every real message must use a fresh one, because a group reuses one
// key across many messages and a repeated IV under one GCM key breaks it.
import { createCipheriv } from 'node:crypto';

const groupKey = Buffer.from(
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  'hex'
);

const seal = (keyVersion, ivHex, plaintext) => {
  const iv = Buffer.from(ivHex, 'hex');
  const cipher = createCipheriv('aes-256-gcm', groupKey, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return {
    keyVersion,
    iv: iv.toString('base64'),
    plaintext,
    sealed: JSON.stringify({
      v: 1,
      k: keyVersion,
      iv: iv.toString('base64'),
      data: data.toString('base64'),
    }),
  };
};

// Two materially different inputs along the dimension the code branches on:
// the key version travels in the envelope, and a member may hold several.
const messages = [
  seal(1, '000102030405060708090a0b', 'the first message under version one'),
  // Composed and decomposed forms must meet: the sealed bytes are of NFC text
  // exactly as given, so a client that normalises differently will not match.
  seal(7, '0b0a09080706050403020100', 'a later version, and an accent: Pässwörd ✓'),
];

process.stdout.write(
  JSON.stringify({ groupKey: groupKey.toString('base64'), messages }, null, 2) + '\n'
);
