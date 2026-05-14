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

export interface DesignVersion {
  id: number;
  html_content: string;
  created_at: string;
}

type APIErrorWithResponse = Error & {
  code?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
};

const AI_DESIGN_VALIDATION_MESSAGE =
  'The AI returned a design that did not meet system rules. Please try again.';

const AI_DESIGN_OPERATION_MESSAGES = {
  generation: {
    timeout: 'AI design generation timed out. Please try again.',
    fallback: 'AI design generation could not be completed. Please try again.',
  },
  refinement: {
    timeout: 'AI design refinement timed out. Please try again.',
    fallback: 'AI design refinement could not be completed. Please try again.',
  },
} as const;

const VALIDATION_ERROR_PATTERNS = [
  /ordinary CSS selectors must be scoped/i,
  /global wrapper selectors are not allowed/i,
  /global :root CSS is not allowed/i,
  /namespace-qualified CSS selectors/i,
  /#hub-feed is a passive runtime mount host/i,
  /design must be valid HTML/i,
  /design must contain a single top-level/i,
  /design must include each slot exactly once/i,
  /design may not contain/i,
  /css declarations must be property-value pairs/i,
  /top-level CSS statements are not allowed/i,
  /blockless at-rules are not allowed/i,
  /nested CSS declaration blocks are not allowed/i,
  /nested CSS is not supported/i,
];

const TIMEOUT_ERROR_PATTERN = /timeout|timed out|deadline exceeded|context deadline exceeded/i;

const getBackendErrorMessage = (data: unknown): string | null => {
  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  for (const key of ['message', 'error', 'detail']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const isValidationErrorMessage = (message: string | null): boolean =>
  !!message && VALIDATION_ERROR_PATTERNS.some((pattern) => pattern.test(message));

const isTimeoutError = (error: APIErrorWithResponse, backendMessage: string | null): boolean =>
  error.code === 'ECONNABORTED' ||
  TIMEOUT_ERROR_PATTERN.test(error.message) ||
  (!!backendMessage && TIMEOUT_ERROR_PATTERN.test(backendMessage));

const toAIDesignError = (error: unknown, operation: 'generation' | 'refinement'): Error => {
  const messages = AI_DESIGN_OPERATION_MESSAGES[operation];

  if (error instanceof Error) {
    const apiError = error as APIErrorWithResponse;
    const backendMessage = getBackendErrorMessage(apiError.response?.data);
    if (isTimeoutError(apiError, backendMessage)) {
      return new Error(messages.timeout);
    }
    if (isValidationErrorMessage(backendMessage)) {
      return new Error(AI_DESIGN_VALIDATION_MESSAGE);
    }
    if (backendMessage) {
      return new Error(backendMessage);
    }
    return new Error(messages.fallback);
  }

  return new Error(messages.fallback);
};

export const hubAIDesignerService = {
  async generateDesign(hubName: string, prompt: string): Promise<GenerateDesignResponse> {
    try {
      const response = await api.post(`/hubs/${hubName}/ai-design/generate`, { prompt }, { timeout: 60000 });
      return response.data;
    } catch (error) {
      throw toAIDesignError(error, 'generation');
    }
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

  async getDesign(hubName: string, designId: number): Promise<{ design: AIDesign }> {
    const response = await api.get(`/hubs/${hubName}/ai-designs/${designId}`);
    return response.data;
  },

  async getVersions(hubName: string, designId: number): Promise<{ versions: DesignVersion[] }> {
    const response = await api.get(`/hubs/${hubName}/ai-designs/${designId}/versions`);
    return response.data;
  },

  async saveVersion(hubName: string, designId: number, htmlContent: string): Promise<{ html_content: string }> {
    const response = await api.post(`/hubs/${hubName}/ai-designs/${designId}/versions`, {
      html_content: htmlContent,
    });
    return response.data;
  },

  async chatRefine(hubName: string, designId: number, currentHtml: string, message: string): Promise<{ html_content: string }> {
    try {
      const response = await api.post(
        `/hubs/${hubName}/ai-designs/${designId}/chat`,
        { current_html: currentHtml, message },
        { timeout: 120000 }
      );
      return response.data;
    } catch (error) {
      throw toAIDesignError(error, 'refinement');
    }
  },
};
