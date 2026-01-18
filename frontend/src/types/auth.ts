export interface User {
  id: number;
  username: string;
  email?: string;
  reddit_id?: string;
  bio?: string;
  avatar_url?: string;
  role: 'user' | 'moderator' | 'admin';
  created_at: string;
  public_key?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  keep_logged_in?: boolean;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
  turnstile_token: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
