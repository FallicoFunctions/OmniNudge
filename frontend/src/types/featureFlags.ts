export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  percentage?: number; // 0-100
  environment?: 'all' | 'dev' | 'staging' | 'prod';
  created_at?: string;
  updated_at?: string;
}

export interface FeatureFlagOverride {
  key: string;
  user_id: number;
  enabled: boolean;
  created_at: string;
}

export interface FeatureFlagAudit {
  id: number;
  flag_key: string;
  change_type: string;
  changed_by: number;
  changed_by_username?: string;
  old_value?: any;
  new_value?: any;
  changed_at: string;
}

export interface FeatureFlagStatus {
  [key: string]: boolean;
}

export interface FeatureFlagUpdateEvent {
  type: 'feature_flag_updated';
  key: string;
  enabled: boolean;
  percentage?: number;
}
