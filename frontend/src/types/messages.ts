
export interface VoiceMessage {
  id: number
  message_id: number
  duration_seconds: number
  waveform_data: number[] | null  // 100 floats [0.0–1.0]
  transcription: string | null
  signed_url: string
  mime_type: string
  file_size: number
}

export interface ConversationUser {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  karma?: number;
}

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupParticipant {
  user_id: number;
  username: string;
  avatar_url?: string | null;
  role: GroupRole;
  joined_at: string;
  invited_by?: number | null;
}

export interface GroupSettings {
  anyone_can_invite: boolean;
  anyone_can_pin: boolean;
  message_history_visible: boolean;
  slow_mode_seconds: number;
}

export interface GroupInvite {
  id: number;
  conversation_id: number;
  group_name?: string | null;
  group_avatar_url?: string | null;
  invited_by_username?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expires_at: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  user1_id?: number | null; // NULL for mod_mail or group
  user2_id?: number | null; // NULL for mod_mail or group
  created_at: string;
  last_message_at: string;
  conversation_type: 'dm' | 'mod_mail' | 'group';
  hub_id?: number | null; // For mod_mail conversations
  hub_name?: string | null; // For mod_mail conversations
  subject?: string | null; // For mod_mail conversations
  status?: string | null; // For mod_mail: 'open', 'archived', 'resolved'
  archived_at?: string | null; // When conversation was archived
  archived_by?: number | null; // User who archived it
  is_archived?: boolean; // Per-user archive state (DM) or thread archive state (mod mail)
  muted?: boolean;
  other_user?: ConversationUser; // Only for DM conversations
  latest_message?: Message;
  unread_count: number;
  // Group conversation fields
  is_group?: boolean;
  group_name?: string | null;
  group_avatar_url?: string | null;
  group_description?: string | null;
  created_by?: number | null;
  max_participants?: number;
  is_public?: boolean;
  is_discoverable?: boolean;
  is_verified?: boolean;
  participant_count?: number;
  current_user_role?: GroupRole | null;
  group_settings?: GroupSettings | null;
}

export interface ConversationFolder {
  id: number;
  user_id: number;
  name: string;
  color: string;
  icon: string;
  position: number;
  conversation_count?: number;
}

export type AutoDeleteInterval = 'never' | '30m' | '1h' | '5h' | '1d' | '2d' | '7d' | '30d';

export interface ChatSettings {
  auto_delete_after: AutoDeleteInterval | null;
}

export interface WsAutoDeleteEvent {
  message_id: number;
  conversation_id: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  recipient_id: number;
  encrypted_content: string;
  sender_encrypted_content?: string | null;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'file';
  sent_at: string;
  delivered_at?: string;
  read_at?: string;
  edited?: boolean;
  edited_at?: string | null;
  pinned?: boolean;
  pinned_by?: number | null;
  pinned_at?: string | null;
  deleted_for_sender?: boolean;
  deleted_for_recipient?: boolean;
  reply_to?: number | null;
  thread_root?: number | null;
  reply_count?: number;
  media_file_id?: number | null;
  media_url?: string | null;
  media_type?: string | null;
  media_size?: number | null;
  encryption_version: string;
  media_encryption_key?: string | null; // RSA-encrypted AES key (Base64)
  media_encryption_iv?: string | null; // AES-GCM IV (Base64)
  sender_media_encryption_key?: string | null;
  is_multi_recipient?: boolean;
  shared_encryption_iv?: string | null;
  recipient_keys?: Record<number, string>;
  /** Set by the server. True when ≥1 reaction exists. Avoids per-message reaction fetches. */
  has_reactions?: boolean;
  voice_message?: VoiceMessage;
  delete_at?: string | null;
}

export interface PinnedMessagesResponse {
  pinned_messages: Message[];
}

export interface WsMessagePinEvent {
  type: 'message_pinned' | 'message_unpinned';
  message_id: number;
  conversation_id: number;
  pinned_by?: number | null;
  pinned_at?: string | null;
  preview?: string;
  message_type?: Message['message_type'];
}

export interface SendMessageRequest {
  conversation_id?: number;
  recipient_username?: string;
  content?: string;
  media_file_id?: number;
  message_type?: Message['message_type'];
  media_url?: string;
  media_type?: string;
  media_size?: number;
  media_encryption_key?: string; // For encrypted media files
  media_encryption_iv?: string; // For encrypted media files
  encryption_version?: string;
  sender_encrypted_content?: string;
  sender_media_encryption_key?: string;
  encrypted_content?: string;
  is_multi_recipient?: boolean;
  shared_encryption_iv?: string;
  recipient_keys?: Record<number, string>;
  reply_to?: number;
}

export interface MessageThreadResponse {
  root_message: Message;
  replies: Message[];
  reply_count: number;
  muted?: boolean;
  limit: number;
  offset: number;
}

export interface WsThreadUpdateEvent {
  type: 'thread_reply_added';
  conversation_id: number;
  thread_root: number;
  reply_id: number;
  reply_count: number;
  message: Message;
}

export interface EditMessageRequest {
  conversation_id: number;
  content: string;
  /** Skip the extra getConversation API call when caller already knows the recipient. */
  recipient_id?: number;
}

export interface MessageEditHistoryEntry {
  id: number;
  message_id: number;
  content?: string | null;
  encrypted_content?: string | null;
  sender_encrypted_content?: string | null;
  encryption_version: string;
  edited_at: string;
  edited_by: number;
}

export interface MessageEditHistoryResponse {
  history: MessageEditHistoryEntry[];
  message_id: number;
  total: number;
  limit: number;
  offset: number;
}

export interface ForwardMessageRequest {
  message_id: number;
  conversation_ids: number[];
  include_media?: boolean;
  encrypted_content?: string;
  sender_encrypted_content?: string;
  encryption_version?: string;
  media_encryption_key?: string;
  media_encryption_iv?: string;
  sender_media_encryption_key?: string;
  is_multi_recipient?: boolean;
  shared_encryption_iv?: string;
  recipient_keys?: Record<number, string>;
}

export interface ForwardMessageResponse {
  original_message_id: number;
  forwarded_message_ids: number[];
  forwarded_count: number;
  queue_warning?: string;
}

export interface ForwardInfoResponse {
  message_id: number;
  forwarded_from?: number | null;
  forward_count: number;
  original_message_id: number;
  original_sender_id: number;
  original_sender?: string;
  original_conversation_id?: number | null;
}

// ─── Group Conversation Types ───────────────────────────────────────────────

export interface CreateGroupRequest {
  name: string;
  participant_ids: number[];
  avatar_url?: string;
  description?: string;
  settings?: Partial<GroupSettings>;
}

export interface UpdateGroupRequest {
  name?: string;
  avatar_url?: string;
  description?: string;
}

export interface UpdateParticipantRoleRequest {
  role: 'admin' | 'member';
}

export interface TransferOwnershipRequest {
  new_owner_user_id: number;
}

export interface CreateGroupInviteRequest {
  user_id: number;
}

// WebSocket group events
export interface WsGroupEvent {
  type:
    | 'group_created'
    | 'member_added'
    | 'member_removed'
    | 'role_changed'
    | 'group_updated'
    | 'user_left'
    | 'ownership_transferred'
    | 'group_settings_updated';
  conversation_id: number;
  actor_id?: number;
  user_id?: number;
  data?: Record<string, unknown>;
}

export interface WsSystemMessageEvent {
  type: 'system_message';
  conversation_id: number;
  text: string;
  created_at: string;
}
