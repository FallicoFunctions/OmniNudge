export interface Conversation {
  id: number;
  participant_id: number;
  participant_username: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_username: string;
  content: string; // Encrypted content
  media_url?: string;
  created_at: string;
  read_at?: string;
}

export interface SendMessageRequest {
  conversation_id?: number;
  recipient_username?: string;
  content: string;
  media_file_id?: number;
}
