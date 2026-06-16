import api from './api';
import type { FeatureFlag, FeatureFlagAudit } from '../types/featureFlags';

export interface CreateFeatureFlagRequest {
  key: string;
  description: string;
  enabled: boolean;
  percentage?: number;
  environment?: 'all' | 'dev' | 'staging' | 'prod';
  auto_rollback?: boolean;
  rollback?: unknown;
}

export interface UpdateFeatureFlagRequest {
  description?: string;
  enabled?: boolean;
  percentage?: number;
  auto_rollback?: boolean;
  rollback?: unknown;
}

const featureFlagService = {
  // Client Methods
  getUserFlags: async (): Promise<string[]> => {
    const response = await api.get<Record<string, boolean>>('/feature-flags');
    return Object.keys(response.data).filter((key) => response.data[key]);
  },

  getAllFlagsWithStatus: async (): Promise<Record<string, boolean>> => {
    const response = await api.get<Record<string, boolean>>('/feature-flags');
    return response.data;
  },

  // Admin Methods
  getFlags: async (): Promise<FeatureFlag[]> => {
    const response = await api.get<FeatureFlag[]>('/admin/feature-flags');
    return response.data;
  },

  getFlag: async (key: string): Promise<FeatureFlag> => {
    const response = await api.get<FeatureFlag>(`/admin/feature-flags/${key}`);
    return response.data;
  },

  createFlag: async (data: CreateFeatureFlagRequest): Promise<FeatureFlag> => {
    const response = await api.post<FeatureFlag>('/admin/feature-flags', data);
    return response.data;
  },

  updateFlag: async (key: string, data: UpdateFeatureFlagRequest): Promise<FeatureFlag> => {
    const response = await api.put<FeatureFlag>(`/admin/feature-flags/${key}`, data);
    return response.data;
  },

  deleteFlag: async (key: string): Promise<void> => {
    await api.delete(`/admin/feature-flags/${key}`);
  },

  setOverride: async (key: string, userId: number, enabled: boolean): Promise<void> => {
    await api.post(`/admin/feature-flags/${key}/overrides`, { user_id: userId, enabled });
  },

  removeOverride: async (key: string, userId: number): Promise<void> => {
    await api.delete(`/admin/feature-flags/${key}/overrides/${userId}`);
  },

  getAuditLog: async (key: string): Promise<FeatureFlagAudit[]> => {
    const response = await api.get<FeatureFlagAudit[]>(`/admin/feature-flags/${key}/audit`);
    return response.data;
  },
};

export default featureFlagService;
