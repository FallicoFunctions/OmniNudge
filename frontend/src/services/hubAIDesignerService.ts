import api from './api';

export interface AIDesign {
  id: number;
  name: string;
  prompt: string;
  html_content: string;
  is_active?: boolean;
  created_at: string;
}

export interface GenerateDesignResponse {
  id: number;
  name: string;
  html_content: string;
  prompt: string;
  message: string;
}

export interface CopyDesignResponse {
  id: number;
  name: string;
  message: string;
}

export interface UpdateDesignRequest {
  name: string;
  html_content: string;
}

export interface UpdateDesignResponse {
  message: string;
  html_content: string;
}

export const hubAIDesignerService = {
  async generateDesign(hubName: string, prompt: string): Promise<GenerateDesignResponse> {
    const response = await api.post(`/hubs/${hubName}/ai-design/generate`, { prompt }, { timeout: 60000 });
    return response.data;
  },

  async getActiveDesign(hubName: string): Promise<{ design: AIDesign | null }> {
    const response = await api.get(`/hubs/${hubName}/ai-design`);
    return response.data;
  },

  async listDesigns(hubName: string): Promise<{ designs: AIDesign[] }> {
    const response = await api.get(`/hubs/${hubName}/ai-designs`);
    return response.data;
  },

  async activateDesign(hubName: string, designId: number): Promise<void> {
    await api.post(`/hubs/${hubName}/ai-designs/${designId}/activate`);
  },

  async deactivateDesign(hubName: string): Promise<void> {
    await api.post(`/hubs/${hubName}/ai-design/deactivate`);
  },

  async deleteDesign(hubName: string, designId: number): Promise<void> {
    await api.delete(`/hubs/${hubName}/ai-designs/${designId}`);
  },

  async copyDesign(hubName: string, designId: number): Promise<CopyDesignResponse> {
    const response = await api.post(`/hubs/${hubName}/ai-designs/${designId}/copy`);
    return response.data;
  },

  async updateDesign(
    hubName: string,
    designId: number,
    data: UpdateDesignRequest
  ): Promise<UpdateDesignResponse> {
    const response = await api.put(`/hubs/${hubName}/ai-designs/${designId}`, data);
    return response.data;
  },
};
