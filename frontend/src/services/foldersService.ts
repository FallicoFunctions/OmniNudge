import { api } from '../lib/api';
import type { Conversation, ConversationFolder } from '../types/messages';

export interface CreateFolderRequest {
  name: string;
  color?: string;
  icon?: string;
}

export interface UpdateFolderRequest {
  name?: string;
  color?: string;
  icon?: string;
}

export const foldersService = {
  async listFolders(): Promise<ConversationFolder[]> {
    const response = await api.get<{ folders: ConversationFolder[] }>('/folders');
    return response.folders ?? [];
  },

  async createFolder(data: CreateFolderRequest): Promise<ConversationFolder> {
    return api.post<ConversationFolder>('/folders', data);
  },

  async updateFolder(id: number, data: UpdateFolderRequest): Promise<ConversationFolder> {
    return api.patch<ConversationFolder>(`/folders/${id}`, data);
  },

  async deleteFolder(id: number): Promise<void> {
    await api.delete(`/folders/${id}`);
  },

  async reorderFolders(folderIDs: number[]): Promise<void> {
    await api.post('/folders/reorder', { folder_ids: folderIDs });
  },

  async addConversation(folderID: number, conversationID: number): Promise<void> {
    await api.post(`/folders/${folderID}/conversations/${conversationID}`, {});
  },

  async removeConversation(folderID: number, conversationID: number): Promise<void> {
    await api.delete(`/folders/${folderID}/conversations/${conversationID}`);
  },

  async getFolderConversations(folderID: number): Promise<Conversation[]> {
    const response = await api.get<{ conversations: Conversation[] }>(
      `/folders/${folderID}/conversations`
    );
    return response.conversations ?? [];
  },

  async getConversationFolders(conversationID: number): Promise<ConversationFolder[]> {
    const response = await api.get<{ folders: ConversationFolder[] }>(
      `/conversations/${conversationID}/folders`
    );
    return response.folders ?? [];
  },
};
