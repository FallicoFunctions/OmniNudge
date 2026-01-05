// Mod Mail types

export interface ModMailParticipant {
  user_id: number;
  username: string;
  avatar_url?: string;
  is_moderator: boolean;
}

export interface ModMailConversation {
  id: number;
  hub_id: number;
  hub_name: string;
  subject: string;
  status: 'open' | 'archived' | 'resolved';
  created_at: string;
  last_message_at: string;
  participants: ModMailParticipant[];
  latest_message?: {
    id: number;
    sender_id: number;
    encrypted_content: string;
    sender_encrypted_content?: string | null;
    message_type: string;
    sent_at: string;
    encryption_version?: string;
    is_multi_recipient?: boolean;
    shared_encryption_iv?: string | null;
    recipient_keys?: Record<number, string>;
  };
  unread_count: number;
}

export interface CreateModMailRequest {
  hub_name: string;
  subject: string;
  message?: string;
  encrypted_content?: string;
  sender_encrypted_content?: string;
  encryption_version?: string;
  is_multi_recipient?: boolean;
  shared_encryption_iv?: string;
  recipient_keys?: Record<number, string>;
}

export interface UpdateModMailStatusRequest {
  status: 'open' | 'archived' | 'resolved';
}
