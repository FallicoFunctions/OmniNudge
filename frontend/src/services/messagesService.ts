import { api } from '../lib/api';
import type {
  Conversation,
  EditMessageRequest,
  ForwardInfoResponse,
  ForwardMessageRequest,
  ForwardMessageResponse,
  Message,
  MessageEditHistoryResponse,
  MessageThreadResponse,
  PinnedMessagesResponse,
  SendMessageRequest,
} from '../types/messages';
import type { UserProfile } from '../types/users';
import { encryptMessage } from '../utils/encryption';
import { MessageNotSent } from '../utils/messageSendErrors';
import { GROUP_ENCRYPTION_VERSION, sealGroupMessage } from '../utils/groupKeys';
import { groupKeyForSending, NoGroupKeyToSendWith } from './groupKeyCache';
import { GroupKeyRotationRefused } from './groupKeysService';
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

/**
 * The group key, with every refusal turned into one the sender can read.
 *
 * Only member-not-set-up names something a person can act on -- wait for them,
 * or ask them to finish setting up. The other rotation refusals mean the
 * request raced or was malformed, which is this app's problem, not advice.
 *
 * Exported because media seals under the same key and must refuse for the same
 * reasons in the same words. One mapping, used by both senders.
 */
export async function groupKeyForSendingOrRefuse(
  conversationId: number,
  ownKeys: Awaited<ReturnType<typeof getOwnKeys>>
) {
  try {
    return await groupKeyForSending(conversationId, ownKeys);
  } catch (error) {
    if (error instanceof NoGroupKeyToSendWith) {
      throw new MessageNotSent(
        error.reason === 'member-key-unusable' ? 'group-member-not-set-up' : 'no-own-keys',
        error.message
      );
    }
    if (error instanceof GroupKeyRotationRefused) {
      throw new MessageNotSent(
        error.refusal === 'member-not-set-up' ? 'group-member-not-set-up' : 'no-group-key',
        error.message
      );
    }
    throw new MessageNotSent('no-group-key', 'The group key could not be read');
  }
}

export const messagesService = {
  async getConversations(includeArchived = false): Promise<Conversation[]> {
    const response = await this.getConversationsPage(includeArchived);
    return response.conversations;
  },

  async getConversationsPage(
    includeArchived = false,
    limit = 20,
    cursor?: string
  ): Promise<{ conversations: Conversation[]; next_cursor?: string }> {
    const params = new URLSearchParams();
    if (includeArchived) {
      params.set('include_archived', 'true');
    }
    params.set('limit', String(limit));
    params.set('offset', '0');
    if (cursor) {
      params.set('cursor', cursor);
    }
    return api.get<{ conversations: Conversation[]; next_cursor?: string }>(
      `/conversations?${params.toString()}`
    );
  },

  async getArchivedConversationsPage(
    limit = 20,
    cursor?: string
  ): Promise<{ conversations: Conversation[]; next_cursor?: string }> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', '0');
    if (cursor) {
      params.set('cursor', cursor);
    }
    return api.get<{ conversations: Conversation[]; next_cursor?: string }>(
      `/conversations/archived?${params.toString()}`
    );
  },

  async getConversation(id: number): Promise<Conversation> {
    return api.get<Conversation>(`/conversations/${id}`);
  },

  async getMessages(conversationId: number): Promise<Message[]> {
    const response = await this.getMessagesPage(conversationId);
    return response.messages;
  },

  async getMessagesPage(
    conversationId: number,
    limit = 50,
    cursor?: string
  ): Promise<{ messages: Message[]; next_cursor?: string }> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: '0',
    });
    if (cursor) {
      params.set('cursor', cursor);
    }
    return api.get<{ messages: Message[]; next_cursor?: string }>(
      `/conversations/${conversationId}/messages?${params.toString()}`
    );
  },

  async getMessageHistory(
    messageId: number,
    limit = 20,
    offset = 0
  ): Promise<MessageEditHistoryResponse> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    return api.get<MessageEditHistoryResponse>(
      `/messages/${messageId}/history?${params.toString()}`
    );
  },

  async getMessageThread(
    messageId: number,
    limit = 20,
    offset = 0
  ): Promise<MessageThreadResponse> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    return api.get<MessageThreadResponse>(`/messages/${messageId}/thread?${params.toString()}`);
  },

  async forwardMessage(data: ForwardMessageRequest): Promise<ForwardMessageResponse> {
    return api.post<ForwardMessageResponse>('/messages/forward', {
      message_id: data.message_id,
      conversation_ids: data.conversation_ids,
      include_media: data.include_media ?? false,
      encrypted_content: data.encrypted_content,
      sender_encrypted_content: data.sender_encrypted_content,
      encryption_version: data.encryption_version,
      media_encryption_key: data.media_encryption_key,
      media_encryption_iv: data.media_encryption_iv,
      sender_media_encryption_key: data.sender_media_encryption_key,
      is_multi_recipient: data.is_multi_recipient,
      shared_encryption_iv: data.shared_encryption_iv,
      recipient_keys: data.recipient_keys,
    });
  },

  async getForwardInfo(messageId: number): Promise<ForwardInfoResponse> {
    return api.get<ForwardInfoResponse>(`/messages/${messageId}/forward-info`);
  },

  async getPinnedMessages(conversationId: number): Promise<PinnedMessagesResponse> {
    return api.get<PinnedMessagesResponse>(`/conversations/${conversationId}/pinned-messages`);
  },

  async pinMessage(messageId: number): Promise<void> {
    await api.post(`/messages/${messageId}/pin`, {});
  },

  async unpinMessage(messageId: number): Promise<void> {
    await api.delete(`/messages/${messageId}/pin`);
  },

  async sendMessage(data: SendMessageRequest): Promise<Message> {
    const conversationId = await ensureConversationId(data);
    const messageType =
      data.message_type ?? (data.media_file_id ? ('image' as Message['message_type']) : 'text');

    // For multi-recipient messages (mod mail), the caller provides encryption payloads.
    // Only fetch the conversation for traditional 1:1 messages to find the recipient.
    const conversation = data.is_multi_recipient
      ? undefined
      : await this.getConversation(conversationId);
    const recipientId = conversation?.other_user?.id;

    const skipClientEncryption = Boolean(data.encrypted_content);
    let encryptedContent = data.encrypted_content ?? data.content ?? '';
    let senderEncryptedContent =
      data.sender_encrypted_content ?? (data.content ? data.content : undefined);
    // A caller that brings its own ciphertext must say what it is. Defaulting to
    // plaintext labelled those bytes as readable text, which is wrong about the
    // payload and would store group media mislabelled the moment a group caller
    // supplies one. Every caller today passes a version; this refuses the first
    // one that forgets rather than guessing on its behalf.
    if (data.encrypted_content && !data.encryption_version) {
      throw new MessageNotSent(
        'encryption-failed',
        'A caller supplied ciphertext without saying how it was encrypted'
      );
    }
    let encryptionVersion: string =
      data.encryption_version ?? (data.content ? 'plaintext' : 'none');
    let groupKeyVersion: number | undefined = data.group_key_version;

    // Encrypt message content if provided
    const ownKeys = await getOwnKeys();

    if (!skipClientEncryption) {
      if (data.content && conversation?.conversation_type === 'group') {
        // Asked before the recipient test on purpose. A group message is sealed
        // once under the group's shared key -- there is no per-reader copy, so
        // the sender opens the same envelope as everyone else. If a group ever
        // arrived carrying an other_user, the recipient branch below would wrap
        // it for that one member and lock the rest of the group out, while the
        // message still looked properly encrypted. Today that cannot happen
        // only because user1_id is NULL for group rows, which is a column
        // convention holding up an encryption decision.
        const { key, version } = await groupKeyForSendingOrRefuse(conversationId, ownKeys);
        encryptedContent = await sealGroupMessage(data.content, key, version);
        encryptionVersion = GROUP_ENCRYPTION_VERSION;
        groupKeyVersion = version;
      } else if (data.content && recipientId) {
        try {
          // Fetch recipient's public key
          const publicKeys = await encryptionService.getPublicKeys([recipientId]);
          const recipientPublicKeyBase64 = publicKeys[recipientId];

          if (!recipientPublicKeyBase64) {
            throw new MessageNotSent(
              'recipient-key-unusable',
              'The recipient has published no encryption key'
            );
          }
          const recipientPublicKey = await getUserPublicKey(recipientId, recipientPublicKeyBase64);
          if (!recipientPublicKey) {
            throw new MessageNotSent(
              'recipient-key-unusable',
              'The recipient key could not be read'
            );
          }
          encryptedContent = await encryptMessage(data.content, recipientPublicKey);
          encryptionVersion = 'v2';
        } catch (error) {
          // A refusal is already the reason; anything else becomes one. Nothing
          // here falls back to sending in clear, which is what this replaced.
          if (error instanceof MessageNotSent) throw error;
          throw new MessageNotSent('encryption-failed', 'The message could not be encrypted');
        }
      } else if (data.content) {
        // Neither a direct message nor a group: nothing here can encrypt it, and
        // sending it in clear is what this whole path exists to stop.
        throw new MessageNotSent(
          'encryption-failed',
          'This conversation has nobody to encrypt for'
        );
      }

      if (data.content && encryptionVersion !== GROUP_ENCRYPTION_VERSION) {
        if (!ownKeys?.publicKey) {
          throw new MessageNotSent('no-own-keys', 'This device has no encryption keys');
        }
        try {
          senderEncryptedContent = await encryptMessage(data.content, ownKeys.publicKey);
        } catch {
          throw new MessageNotSent('encryption-failed', 'The sender copy could not be encrypted');
        }
      } else {
        senderEncryptedContent = undefined;
      }
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
      is_multi_recipient: data.is_multi_recipient,
      shared_encryption_iv: data.shared_encryption_iv,
      recipient_keys: data.recipient_keys,
      group_key_version: groupKeyVersion,
      reply_to: data.reply_to,
    });
  },

  async editMessage(messageId: number, data: EditMessageRequest): Promise<Message> {
    // Use caller-supplied recipient_id when available to skip the extra API round-trip.
    const recipientId =
      data.recipient_id !== undefined
        ? data.recipient_id
        : (await this.getConversation(data.conversation_id)).other_user?.id;

    let encryptedContent = data.content;
    let senderEncryptedContent = data.content;
    let encryptionVersion = 'plaintext';

    const ownKeys = await getOwnKeys();
    // An edit replaces the content of a message that was sent encrypted, so a
    // fallback here is worse than one on the send path: it downgrades a message
    // that was already protected. The edit refuses instead.
    if (recipientId) {
      try {
        const publicKeys = await encryptionService.getPublicKeys([recipientId]);
        const recipientPublicKeyBase64 = publicKeys[recipientId];
        if (!recipientPublicKeyBase64) {
          throw new MessageNotSent(
            'recipient-key-unusable',
            'The recipient has published no encryption key'
          );
        }
        const recipientPublicKey = await getUserPublicKey(recipientId, recipientPublicKeyBase64);
        if (!recipientPublicKey) {
          throw new MessageNotSent('recipient-key-unusable', 'The recipient key could not be read');
        }
        encryptedContent = await encryptMessage(data.content, recipientPublicKey);
        encryptionVersion = 'v2';
      } catch (error) {
        if (error instanceof MessageNotSent) throw error;
        throw new MessageNotSent('encryption-failed', 'The edit could not be encrypted');
      }
    }

    if (!ownKeys?.publicKey) {
      throw new MessageNotSent('no-own-keys', 'This device has no encryption keys');
    }
    try {
      senderEncryptedContent = await encryptMessage(data.content, ownKeys.publicKey);
    } catch {
      throw new MessageNotSent(
        'encryption-failed',
        'The edited sender copy could not be encrypted'
      );
    }

    return api.patch<Message>(`/messages/${messageId}`, {
      encrypted_content: encryptedContent,
      sender_encrypted_content: senderEncryptedContent,
      // The plaintext does not travel. EditMessageRequest still declares a
      // content field and the handler never reads it: the edit history row
      // stores the message's own ciphertext, and the UPDATE touches only the
      // encrypted columns. Sending it put the cleartext on the wire, and in
      // every log along it, to be dropped on arrival.
      encryption_version: encryptionVersion,
    });
  },

  async markAsRead(conversationId: number): Promise<void> {
    await api.post(`/conversations/${conversationId}/read`, {});
  },

  async deleteMessage(messageId: number, options?: { deleteFor?: 'self' | 'both' }): Promise<void> {
    const scope =
      options?.deleteFor && options.deleteFor !== 'self' ? options.deleteFor : undefined;
    const query = scope ? `?delete_for=${scope}` : '';
    await api.delete(`/messages/${messageId}${query}`);
  },

  async archiveConversation(conversationId: number): Promise<void> {
    await api.put(`/conversations/${conversationId}/archive`, {});
  },

  async archiveConversationsBatch(conversationIds: number[]): Promise<void> {
    await api.post('/conversations/archive-batch', { conversation_ids: conversationIds });
  },

  async unarchiveConversation(conversationId: number): Promise<void> {
    await api.put(`/conversations/${conversationId}/unarchive`, {});
  },

  async muteConversation(conversationId: number): Promise<void> {
    await api.put(`/conversations/${conversationId}/mute`, {});
  },

  async unmuteConversation(conversationId: number): Promise<void> {
    await api.put(`/conversations/${conversationId}/unmute`, {});
  },

  async muteThread(messageId: number): Promise<void> {
    await api.put(`/messages/${messageId}/thread/mute`, {});
  },

  async unmuteThread(messageId: number): Promise<void> {
    await api.put(`/messages/${messageId}/thread/unmute`, {});
  },

  async deleteConversation(
    conversationId: number,
    options?: { deleteFor?: 'me' | 'both' }
  ): Promise<void> {
    const deleteFor = options?.deleteFor || 'me';
    const query = `?delete_for=${deleteFor}`;
    await api.delete(`/conversations/${conversationId}${query}`);
  },

  async getChatSettings(
    conversationId: number
  ): Promise<{ auto_delete_after_seconds: number | null }> {
    return api.get<{ auto_delete_after_seconds: number | null }>(
      `/conversations/${conversationId}/settings`
    );
  },

  async updateChatSettings(
    conversationId: number,
    autoDeleteAfterSeconds: number, // 0 = never / clear override
    applyRetroactive: boolean
  ): Promise<void> {
    await api.patch(`/conversations/${conversationId}/settings`, {
      auto_delete_after_seconds: autoDeleteAfterSeconds,
      apply_retroactive: applyRetroactive,
    });
  },
};
