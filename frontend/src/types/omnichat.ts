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

/** Subscription entitlement, distinct from the conversation profile a member chooses. */
export type OmniChatAccountTier = 'free' | 'plus' | 'premium';

/** User-facing conversation profiles. Provider and reasoning settings remain server-side. */
export type OmniChatModelKey =
  | 'standard'
  | 'plus'
  | 'premium_quick'
  | 'premium_deep'
  | 'ultra_fast';
export type OmniChatModelScope = 'this_chat' | 'all_chats';

export interface OmniChatModelSelection {
  account_tier: OmniChatAccountTier;
  default_model_key: OmniChatModelKey;
  conversation_model_key?: OmniChatModelKey;
  effective_model_key: OmniChatModelKey;
}

export interface BotConversation {
  id: number;
  user_id: number;
  persona_id: number;
  persona?: BotPersona;
  title?: string;
  last_message_preview?: string;
  /**
   * True when the newest message is a generated image or video. Such messages
   * carry no text, so an empty preview does NOT mean the conversation is empty
   * — treating it that way hides conversations the user generated media in.
   */
  last_message_media_only?: boolean;
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
  request_id?: string;
  attachments?: OmniChatMessageMediaAsset[];
  created_at: string;
}

export type OmniChatResponseFeedbackReason =
  | 'role_ownership'
  | 'user_agency'
  | 'narration_format'
  | 'repetition_length'
  | 'grammar_artifact'
  | 'character_mismatch'
  | 'other';

/** A report intentionally excludes prompt, provider, and response-content data. */
export interface OmniChatResponseFeedbackRequest {
  reason: OmniChatResponseFeedbackReason;
  note?: string;
}

export type OmniChatMediaKind = 'image' | 'video';
export type OmniChatGenerationMode = 'create' | 'contextual' | 'image_to_video';
export type OmniChatGenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface OmniChatSceneState {
  location?: string;
  time_of_day?: string;
  weather?: string;
  lighting?: string;
  activity?: string;
  outfit?: string;
  accessories?: string[];
  pose?: string;
  expression?: string;
  mood?: string;
  camera_direction?: string;
  other_characters?: string[];
  recent_events?: string[];
  /** Server-derived; the client never sets this. */
  include_user_body?: boolean;
}

export interface OmniChatGenerationRequest {
  /** One stable UUID for this user intent; required for server-side replay safety. */
  request_id: string;
  kind: OmniChatMediaKind;
  mode: OmniChatGenerationMode;
  persona_id: number;
  conversation_id?: number;
  source_message_id?: number;
  source_asset_id?: string;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: '1:1' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9';
  duration_seconds?: number;
  scene?: OmniChatSceneState;
}

export interface OmniChatGenerationJob {
  id: string;
  owner_user_id: number;
  persona_id: number;
  conversation_id?: number;
  source_message_id?: number;
  source_asset_id?: string;
  output_asset_id?: string;
  output_message_id?: number;
  kind: OmniChatMediaKind;
  mode: OmniChatGenerationMode;
  status: OmniChatGenerationStatus;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: string;
  duration_seconds?: number;
  scene: OmniChatSceneState;
  provider?: string;
  progress: number;
  error_code?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface OmniChatMediaAsset {
  id: string;
  owner_user_id: number;
  persona_id: number;
  conversation_id?: number;
  source_message_id?: number;
  generation_job_id: string;
  kind: OmniChatMediaKind;
  visibility: 'private' | 'public';
  prompt: string;
  scene: OmniChatSceneState;
  width?: number;
  height?: number;
  duration_seconds?: number;
  file_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';
  content_url: string;
  created_at: string;
}

export interface OmniChatMessageMediaAsset {
  id: string;
  kind: OmniChatMediaKind;
  visibility: 'private' | 'public';
  width?: number;
  height?: number;
  duration_seconds?: number;
  file_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';
  content_url: string;
  created_at: string;
}

export type OmniChatPublicationKind = 'image' | 'video' | 'chat';

export interface OmniChatPublicAuthor {
  id: number;
  username: string;
  avatar_url?: string;
}

export interface OmniChatPublicMediaAsset {
  id: string;
  kind: OmniChatMediaKind;
  visibility: 'public';
  width?: number;
  height?: number;
  duration_seconds?: number;
  file_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';
  content_url: string;
  created_at: string;
}

export interface OmniChatSnapshotMessage {
  position: number;
  role: BotMessageRole;
  content: string;
  attachments?: OmniChatPublicMediaAsset[];
  created_at: string;
}

export interface OmniChatChatSnapshot {
  id: string;
  persona_id: number;
  title: string;
  excerpt: string;
  message_count: number;
  messages?: OmniChatSnapshotMessage[];
  created_at: string;
}

export interface OmniChatPublication {
  id: string;
  author_user_id: number;
  author: OmniChatPublicAuthor;
  persona_id: number;
  persona_name: string;
  persona_avatar_url?: string;
  content_kind: OmniChatPublicationKind;
  caption: string;
  visibility: 'public' | 'unlisted';
  status: 'published' | 'under_review' | 'removed';
  is_nsfw: boolean;
  like_count: number;
  comment_count: number;
  share_count: number;
  remix_count: number;
  viewer_liked: boolean;
  viewer_bookmarked: boolean;
  viewer_following: boolean;
  asset?: OmniChatPublicMediaAsset;
  snapshot?: OmniChatChatSnapshot;
  published_at: string;
  updated_at: string;
}

export interface OmniChatPublicationComment {
  id: string;
  publication_id: string;
  author_user_id: number;
  author: OmniChatPublicAuthor;
  parent_id?: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface OmniChatGroupMember {
  user_id: number;
  username: string;
  avatar_url?: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface OmniChatGroupPersona {
  persona_id: number;
  name: string;
  avatar_url?: string;
  display_order: number;
  joined_at: string;
}

export interface OmniChatGroup {
  id: string;
  owner_user_id: number;
  name: string;
  description: string;
  avatar_url?: string;
  visibility: 'private' | 'invite' | 'public';
  viewer_role: 'owner' | 'admin' | 'member';
  members: OmniChatGroupMember[];
  personas: OmniChatGroupPersona[];
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

export interface OmniChatGroupMessage {
  id: string;
  group_id: string;
  sender_type: 'user' | 'persona' | 'system';
  sender_user_id?: number;
  sender_persona_id?: number;
  sender_name: string;
  sender_avatar_url?: string;
  reply_to_id?: string;
  content: string;
  failed: boolean;
  created_at: string;
}

export interface OmniChatGroupInvite {
  id: string;
  group_id: string;
  invitee_user_id?: number;
  max_uses: number;
  use_count: number;
  expires_at: string;
  created_at: string;
}

export interface OmniChatPersonaVoice {
  persona_id: number;
  provider: 'browser' | 'elevenlabs' | 'voicebox';
  voice_id: string;
  voice_name: string;
  model_id: string;
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  pitch: number;
  language_code?: string;
  active: boolean;
  updated_at?: string;
}

export interface OmniChatVoicePreset {
  id: string;
  name: string;
  gender: 'female' | 'male';
  provider: 'voicebox';
  voice_id: string;
  model_id: 'kokoro';
  language_code: string;
}

export interface OmniChatVoiceCatalog {
  presets: OmniChatVoicePreset[];
  voicebox_available: boolean;
  voice_cloning_enabled: boolean;
}

export interface OmniChatCallSession {
  id: string;
  user_id: number;
  persona_id: number;
  conversation_id: number;
  mode: 'voice' | 'video';
  status: 'active' | 'ended' | 'failed';
  recording_enabled: boolean;
  turn_count: number;
  started_at: string;
  last_activity_at: string;
  ended_at?: string;
  live_video_url?: string;
  live_video_token?: string;
  live_video_room?: string;
  live_video_token_ttl_seconds?: number;
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

export interface OmniChatAllowanceState {
  tier: 'guest' | 'free' | 'paid';
  allowed: boolean;
  unlimited: boolean;
  limit?: number;
  used?: number;
  remaining?: number;
  reset_at?: string;
  window_seconds?: number;
}

/**
 * What a character has inferred and stored about the user.
 *
 * Unlike a message, a memory is a claim the system made rather than something
 * the user wrote, so it carries the conversation and message it came from. That
 * provenance is what makes a wrong memory contestable instead of merely
 * annoying.
 */
export interface OmniChatMemory {
  id: number;
  persona_id: number;
  conversation_id: number;
  source_message_id?: number;
  title: string;
  summary: string;
  salience: number;
  distinctiveness: number;
  emotional_valence: number | null;
  recorded_at: string;
}

export interface OmniChatMemoryList {
  /** Every active memory, not just this page. */
  total: number;
  /** True when the page is truncated and older memories are not shown. */
  has_more: boolean;
  memories: OmniChatMemory[];
}
