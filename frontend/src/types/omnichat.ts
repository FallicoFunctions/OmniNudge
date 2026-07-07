export type PersonaCategory =
  | 'roleplay'
  | 'helper'
  | 'romance'
  | 'original'
  | 'anime_game'
  | 'fiction_media';

export interface BotPersona {
  id: number;
  slug: string;
  name: string;
  description?: string;
  category: PersonaCategory;
  avatar_url?: string;
  preview_video_url?: string;
  is_nsfw: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationSettings {
  user_name: string;
  user_age: string;
  user_gender: string;
}

export interface BotConversation {
  id: number;
  user_id: number;
  persona_id: number;
  persona?: BotPersona;
  title?: string;
  last_message_preview?: string;
  settings?: ConversationSettings;
  created_at: string;
  last_message_at: string;
  archived_at?: string;
}

export type BotMessageRole = 'user' | 'assistant';

export interface BotMessage {
  id: number;
  conversation_id: number;
  role: BotMessageRole;
  content: string;
  failed: boolean;
  created_at: string;
}

export interface OmniChatTokenPayload {
  conversation_id: number;
  token: string;
}

export interface BotConversationDetail {
  conversation: BotConversation;
  messages: BotMessage[];
}

export interface AnonymousMessageRequest {
  persona_id: number;
  content: string;
  history: Array<{ role: string; content: string }>;
}

export interface AnonymousMessageResponse {
  role: 'assistant';
  content: string;
  failed: boolean;
}
