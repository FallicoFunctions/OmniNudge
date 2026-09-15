#!/usr/bin/env node
// Prints the login key an account on the login-key scheme signs in with, for
// the k6 scripts: k6 cannot run 600,000 rounds of PBKDF2, and such an account
// refuses its password. The password comes from the PASSWORD environment
// variable, never the command line, so it stays out of shell history and the
// process list.
//
//   PASSWORD=... node scripts/derive-login-key.mjs <username> [base-url]
//   node scripts/derive-login-key.mjs --self-test
//
// It derives exactly as the app does; --self-test checks it against
// shared/crypto-vectors/login-keys.json. A name with no account gets a
// placeholder salt from the server, so its key simply fails to sign in.
import { hkdfSync, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const LOGIN_KEY_INFO = 'omninudge/login-key/v1';

export function deriveLoginKey(password, salt, iterations) {
  const master = pbkdf2Sync(
    Buffer.from(password.normalize('NFKC'), 'utf8'),
    Buffer.from(salt, 'base64'),
    iterations,
    32,
    'sha256',
  );
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), LOGIN_KEY_INFO, 32)).toString('base64');
}

function selfTest() {
  const vectors = JSON.parse(
    readFileSync(new URL('../shared/crypto-vectors/login-keys.json', import.meta.url), 'utf8'),
  );
  for (const vector of vectors.passwords) {
    if (deriveLoginKey(vector.password, vector.salt, vector.iterations) !== vector.loginKey) {
      console.error(`mismatch for ${JSON.stringify(vector.password)}`);
      return 1;
    }
  }
  console.log(`ok: ${vectors.passwords.length} vectors`);
  return 0;
}

async function main(args) {
  if (args[0] === '--self-test') {
    return selfTest();
  }
  const [username, baseUrl = process.env.BASE_URL || 'http://localhost:8080'] = args;
  const password = process.env.PASSWORD;
  if (!username || !password) {
    console.error('usage: PASSWORD=... node scripts/derive-login-key.mjs <username> [base-url]');
    return 2;
  }
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/auth/prelogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    console.error(`pre-login failed with ${res.status}`);
    return 1;
  }
  const pre = await res.json();
  if (pre.scheme === 1) {
    console.error('This account still signs in with its password: give the k6 script PASSWORD instead.');
    return 3;
  }
  if (pre.scheme !== 2 || typeof pre.kdf_salt !== 'string' || typeof pre.kdf_iterations !== 'number') {
    console.error('unexpected pre-login answer');
    return 1;
  }
  console.log(deriveLoginKey(password, pre.kdf_salt, pre.kdf_iterations));
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
