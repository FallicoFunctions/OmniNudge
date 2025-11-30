export interface User {
  id: number;
  username: string;
  email?: string;
  reddit_id?: string;
  bio?: string;
  avatar_url?: string;
  role: 'user' | 'moderator' | 'admin';
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
