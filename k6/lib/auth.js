// Sign-in helpers for the k6 scripts. Pure functions with no k6 imports, so
// node --test can check them (k6/lib/auth.test.mjs).

// The body for POST /auth/login. An account on the login-key scheme refuses
// its password and signs in with LOGIN_KEY (printed by
// scripts/derive-login-key.mjs); PASSWORD alone works only for an account still
// on the old scheme, such as the seed users.
export function loginBody(username, loginKey, password) {
  return loginKey ? { username, login_key: loginKey } : { username, password };
}

// The server answers a sign-in with session cookies and no token in the body.
// The access token is the omni_access cookie; the scripts send it back as a
// Bearer header, which the auth middleware reads before the cookie.
export const ACCESS_COOKIE = 'omni_access';

export function accessTokenFrom(response) {
  const cookies = response && response.cookies ? response.cookies[ACCESS_COOKIE] : undefined;
  return cookies && cookies.length > 0 && cookies[0].value ? cookies[0].value : '';
}
