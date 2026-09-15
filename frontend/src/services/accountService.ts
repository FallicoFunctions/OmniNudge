import api from './api';
import { accountProof } from './accountKeysService';

interface DataExportOptions {
  data_types: string[];
  include_deleted: boolean;
}

interface DataExportResponse {
  message: string;
  export_id: string;
  status: string;
  expires_at: string;
  note: string;
}

interface ExportStatus {
  export_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  expires_at?: string;
  download_ready?: boolean;
  expired: boolean;
  message?: string;
}

interface ExportListResponse {
  exports: ExportStatus[];
  total: number;
}

class AccountService {
  /**
   * Request a GDPR data export
   * P0-016: GDPR Right to Data Portability
   */
  async requestDataExport(
    username: string,
    password: string,
    options: DataExportOptions
  ): Promise<DataExportResponse> {
    const response = await api.post('/account/export', {
      ...(await accountProof(username, password)),
      ...options,
    });
    return response.data;
  }

  /**
   * Get the status of a data export request
   */
  async getExportStatus(exportId: string): Promise<ExportStatus> {
    const response = await api.get(`/account/export/${exportId}`);
    return response.data;
  }

  /**
   * List all data export requests for the current user
   */
  async listExports(): Promise<ExportListResponse> {
    const response = await api.get('/account/exports');
    return response.data;
  }

  getExportDownloadUrl(exportId: string): string {
    return `${api.defaults.baseURL}/account/export/${exportId}/download`;
  }

  /**
   * Request account deletion (P0-017)
   */
  async requestAccountDeletion(username: string, password: string, confirm: string) {
    const response = await api.post('/account/delete', {
      ...(await accountProof(username, password)),
      confirm,
    });
    return response.data;
  }
}

export const accountService = new AccountService();
