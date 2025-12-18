export interface ConversationUser {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  karma?: number;
}

export interface Conversation {
  id: number;
  user1_id: number;
  user2_id: number;
  created_at: string;
  last_message_at: string;
  other_user?: ConversationUser;
  latest_message?: Message;
  unread_count: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  recipient_id: number;
  encrypted_content: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'file';
  sent_at: string;
  delivered_at?: string;
  read_at?: string;
  deleted_for_sender?: boolean;
  deleted_for_recipient?: boolean;
  media_file_id?: number | null;
  media_url?: string | null;
  media_type?: string | null;
  media_size?: number | null;
  encryption_version: string;
  media_encryption_key?: string | null; // RSA-encrypted AES key (Base64)
  media_encryption_iv?: string | null; // AES-GCM IV (Base64)
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
}
