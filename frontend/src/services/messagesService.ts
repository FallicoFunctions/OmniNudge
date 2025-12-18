import { api } from '../lib/api';
import type { Conversation, Message, SendMessageRequest } from '../types/messages';
import type { UserProfile } from '../types/users';
import { encryptMessage } from '../utils/encryption';
import { getUserPublicKey, getOwnKeys } from '../services/keyManagementService';
import { encryptionService } from '../services/encryptionService';

async function fetchUserByUsername(username: string): Promise<UserProfile> {
  return api.get<UserProfile>(`/users/${username}`);
}

async function ensureConversationId(data: SendMessageRequest): Promise<number> {
  if (data.conversation_id) {
    return data.conversation_id;
  }

  if (!data.recipient_username) {
    throw new Error('Recipient username is required to start a conversation');
  }

  const user = await fetchUserByUsername(data.recipient_username);
  const conversation = await api.post<Conversation>('/conversations', {
    other_user_id: user.id,
  });

  return conversation.id;
}

export const messagesService = {
  async getConversations(): Promise<Conversation[]> {
    const response = await api.get<{ conversations: Conversation[] }>('/conversations');
    return response.conversations;
  },

  async getConversation(id: number): Promise<Conversation> {
    return api.get<Conversation>(`/conversations/${id}`);
  },

  async getMessages(conversationId: number): Promise<Message[]> {
    const response = await api.get<{ messages: Message[] }>(
      `/conversations/${conversationId}/messages`
    );
    return response.messages;
  },

  async sendMessage(data: SendMessageRequest): Promise<Message> {
    const conversationId = await ensureConversationId(data);
    const messageType =
      data.message_type ?? (data.media_file_id ? ('image' as Message['message_type']) : 'text');

    // Get the conversation to find recipient ID
    const conversation = await this.getConversation(conversationId);
    const recipientId = conversation.other_user?.id;

    let encryptedContent = data.content ?? '';
    let senderEncryptedContent = data.content ?? undefined;
    let encryptionVersion: string = data.content ? 'plaintext' : 'none';

    // Encrypt message content if provided
    const ownKeys = await getOwnKeys();

    if (data.content && recipientId) {
      try {
        // Fetch recipient's public key
        const publicKeys = await encryptionService.getPublicKeys([recipientId]);
        const recipientPublicKeyBase64 = publicKeys[recipientId];

        if (recipientPublicKeyBase64) {
          // Import recipient's public key
          const recipientPublicKey = await getUserPublicKey(recipientId, recipientPublicKeyBase64);

          if (recipientPublicKey) {
            // Encrypt the message
            encryptedContent = await encryptMessage(data.content, recipientPublicKey);
            encryptionVersion = 'v1';
          } else {
            // Fallback to plaintext if key import fails
            console.warn('Failed to import recipient public key, sending plaintext');
            encryptedContent = data.content;
            encryptionVersion = 'plaintext';
          }
        } else {
          // Recipient hasn't set up encryption yet, send plaintext
          console.warn('Recipient has no public key, sending plaintext');
          encryptedContent = data.content;
          encryptionVersion = 'plaintext';
        }
      } catch (error) {
        // Fallback to plaintext if encryption fails
        console.error('Encryption failed, sending plaintext:', error);
        encryptedContent = data.content;
        encryptionVersion = 'plaintext';
      }
    } else if (data.content) {
      encryptedContent = data.content;
      encryptionVersion = 'plaintext';
    }

    if (data.content && ownKeys?.publicKey) {
      try {
        senderEncryptedContent = await encryptMessage(data.content, ownKeys.publicKey);
      } catch (error) {
        console.error('Failed to encrypt sender copy, storing plaintext:', error);
        senderEncryptedContent = data.content;
      }
    } else if (!data.content) {
      senderEncryptedContent = undefined;
    }

    return api.post<Message>('/messages', {
      conversation_id: conversationId,
      encrypted_content: encryptedContent,
      message_type: messageType,
      media_file_id: data.media_file_id,
      media_url: data.media_url,
      media_type: data.media_type,
      media_size: data.media_size,
      encryption_version: encryptionVersion,
      media_encryption_key: data.media_encryption_key,
      media_encryption_iv: data.media_encryption_iv,
      sender_encrypted_content: senderEncryptedContent,
      sender_media_encryption_key: data.sender_media_encryption_key,
    });
  },

  async markAsRead(conversationId: number): Promise<void> {
    await api.post(`/conversations/${conversationId}/read`, {});
  },
};
