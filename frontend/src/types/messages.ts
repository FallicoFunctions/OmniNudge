export interface ConversationUser {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  karma?: number;
}

export interface Conversation {
  id: number;
  user1_id?: number | null; // NULL for mod_mail
  user2_id?: number | null; // NULL for mod_mail
  created_at: string;
  last_message_at: string;
  conversation_type: 'dm' | 'mod_mail';
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
  pinned?: boolean;
  pinned_by?: number | null;
  pinned_at?: string | null;
  deleted_for_sender?: boolean;
  deleted_for_recipient?: boolean;
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
}
