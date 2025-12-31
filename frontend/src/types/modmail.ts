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
    message_type: string;
    sent_at: string;
  };
  unread_count: number;
}

export interface CreateModMailRequest {
  hub_name: string;
  subject: string;
  message: string;
}

export interface UpdateModMailStatusRequest {
  status: 'open' | 'archived' | 'resolved';
}
