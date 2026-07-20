export type PersonaCategory =
  | 'roleplay'
  | 'helper'
  | 'romance'
  | 'original'
  | 'anime_game'
  | 'fiction_media';

export type ResponseStyleProfile =
  | 'inherit'
  | 'natural_dialogue'
  | 'lean_narrative'
  | 'professional'
  | 'character_only';

export interface BotPersona {
  id: number;
  slug: string;
  name: string;
  description?: string;
  first_message?: string;
  category: PersonaCategory;
  owner_user_id?: number;
  visibility?: 'public' | 'private' | 'unlisted';
  source_format?: string;
  response_style_profile?: ResponseStyleProfile;
  avatar_url?: string;
  preview_video_url?: string;
  gallery_urls?: string[];
  tags?: string[];
  creator_name?: string;
  character_version?: string;
  is_nsfw: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BotPersonaDefinition extends BotPersona {
  system_prompt: string;
  personality: string;
  scenario: string;
  first_message: string;
  example_dialogue: string;
  response_style_profile: ResponseStyleProfile;
  post_history_instructions: string;
  alternate_greetings: string[];
  creator_notes: string;
  character_book_json?: Record<string, unknown>;
  extensions_json: Record<string, unknown>;
  import_source_filename?: string;
}

export interface PersonaDefinitionPayload {
  name: string;
  description: string;
  category: PersonaCategory;
  visibility: 'public' | 'private' | 'unlisted';
  system_prompt: string;
  personality: string;
  scenario: string;
  first_message: string;
  example_dialogue: string;
  response_style_profile: ResponseStyleProfile;
  post_history_instructions: string;
  alternate_greetings: string[];
  creator_notes: string;
  tags: string[];
  creator_name: string;
  character_version: string;
  avatar_url?: string;
  preview_video_url?: string;
  gallery_urls: string[];
  is_nsfw: boolean;
  character_book_json?: Record<string, unknown>;
  extensions_json?: Record<string, unknown>;
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

export interface OmniChatRegenerationTokenPayload extends OmniChatTokenPayload {
  message_id: number;
}

export interface BotConversationDetail {
  conversation: BotConversation;
  messages: BotMessage[];
}

export interface PreviewMessageRequest {
  persona_id: number;
  content: string;
  history: Array<{ role: string; content: string }>;
}

export interface PreviewMessageResponse {
  role: 'assistant';
  content: string;
  failed: boolean;
}
