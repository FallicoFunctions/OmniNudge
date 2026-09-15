export interface User {
  id: number;
  username: string;
  email?: string;
  bio?: string;
  avatar_url?: string;
  role: 'user' | 'moderator' | 'admin';
  created_at: string;
  public_key?: string;
  plan?: 'free' | 'plus' | 'premium';
  plan_expires_at?: string | null;
}

/**
 * An account on the login-key scheme sends login_key, never password; an
 * account still on the old scheme sends password.
 */
export interface LoginRequest {
  username: string;
  password?: string;
  login_key?: string;
  keep_logged_in?: boolean;
}

export interface RegisterRequest {
  username: string;
  password?: string;
  login_key?: string;
  kdf_salt?: string;
  kdf_iterations?: number;
  email?: string;
  turnstile_token: string;
  accept_privacy_policy: boolean;
  accept_terms: boolean;
}

/** How an account proves its password: 1 sends it, 2 sends a derived login key. */
export interface PreLoginResponse {
  scheme: 1 | 2;
  kdf_salt?: string;
  kdf_iterations?: number;
}

/**
 * What a device needs to unlock the private key. auth_scheme and has_password
 * say which secret the account proves itself with; an account with no
 * password signed up through a provider.
 */
export interface KeyBackup {
  auth_scheme: number;
  has_password: boolean;
  kdf_salt?: string;
  kdf_iterations?: number;
  encrypted_private_key?: string;
  recovery_wrapped_private_key?: string;
}

export interface AuthResponse {
  user: User;
}
