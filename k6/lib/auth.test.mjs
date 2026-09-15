// node --test k6/lib/auth.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accessTokenFrom, loginBody } from './auth.js';

test('signs a login-key account in with its login key, never its password', () => {
  assert.deepEqual(loginBody('loadtester', 'the-login-key', 'the-password'), {
    username: 'loadtester',
    login_key: 'the-login-key',
  });
});

test('signs an old-scheme account in with its password when no login key is given', () => {
  assert.deepEqual(loginBody('seed_user_1', '', 'Password123!'), {
    username: 'seed_user_1',
    password: 'Password123!',
  });
});

test('takes the access token from the omni_access cookie, as the server sends it', () => {
  // The shape k6 gives res.cookies: name -> array of { name, value, ... }.
  const response = {
    status: 200,
    body: '{"user":{"id":1}}',
    cookies: {
      omni_access: [{ name: 'omni_access', value: 'access-jwt' }],
      omni_refresh: [{ name: 'omni_refresh', value: 'refresh-jwt' }],
    },
  };
  assert.equal(accessTokenFrom(response), 'access-jwt');
});

test('finds no token when the access cookie is missing or empty', () => {
  assert.equal(accessTokenFrom({ cookies: {} }), '');
  assert.equal(accessTokenFrom({ cookies: { omni_access: [] } }), '');
  assert.equal(accessTokenFrom({ cookies: { omni_access: [{ value: '' }] } }), '');
  assert.equal(accessTokenFrom(undefined), '');
});
