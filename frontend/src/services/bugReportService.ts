import { api } from '../lib/api';

export interface BugReport {
  id: number;
  user_id?: number;
  page_url: string;
  description: string;
  screenshot_url?: string;
  feedback_type: 'report';
  feedback_category: 'bug' | 'feature_request' | 'other';
  context?: Record<string, unknown>;
  status: 'new' | 'investigating' | 'fixed' | 'wont_fix' | 'duplicate';
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  username?: string;
}

export interface KnownBug {
  id: number;
  title: string;
  description: string;
  status: 'investigating' | 'in_progress' | 'fixed' | 'wont_fix';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affected_pages: string[];
  fixed_in_version?: string;
  workaround?: string;
  created_at: string;
  updated_at: string;
  fixed_at?: string;
}

export interface CreateBugReportRequest {
  page_url: string;
  description: string;
  screenshot_url?: string;
  feedback_type?: 'report';
  feedback_category?: 'bug';
  context?: Record<string, unknown>;
}

export interface BugReportsResponse {
  reports: BugReport[];
  limit: number;
  offset: number;
  next_cursor?: string;
}

export interface KnownBugsResponse {
  bugs: KnownBug[];
}

export const bugReportService = {
  // Create a new bug report (public, optional auth)
  async createBugReport(request: CreateBugReportRequest): Promise<BugReport> {
    return api.post<BugReport>('/bug-reports', request);
  },

  // Get list of known bugs (public)
  async getKnownBugs(status?: string): Promise<KnownBugsResponse> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    const query = params.toString();
    return api.get<KnownBugsResponse>(`/bug-reports/known${query ? `?${query}` : ''}`);
  },

  // Admin only: Get all bug reports
  async getBugReports(options?: {
    status?: string;
    feedbackCategory?: string;
    feedbackType?: string;
    limit?: number;
    offset?: number;
    cursor?: string;
  }): Promise<BugReportsResponse> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (options?.status) params.append('status', options.status);
    if (options?.feedbackCategory) params.append('feedback_category', options.feedbackCategory);
    if (options?.feedbackType) params.append('feedback_type', options.feedbackType);
    if (options?.cursor) params.append('cursor', options.cursor);
    return api.get<BugReportsResponse>(`/admin/bug-reports?${params.toString()}`);
  },

  // Admin only: Update bug report status
  async updateBugReport(id: number, status: string, adminNotes?: string): Promise<void> {
    await api.put(`/admin/bug-reports/${id}`, { status, admin_notes: adminNotes });
  },

  // Admin only: Create known bug
  async createKnownBug(
    bug: Omit<KnownBug, 'id' | 'created_at' | 'updated_at' | 'fixed_at'>
  ): Promise<KnownBug> {
    return api.post<KnownBug>('/admin/known-bugs', bug);
  },

  // Admin only: Update known bug
  async updateKnownBug(
    id: number,
    bug: Omit<KnownBug, 'id' | 'created_at' | 'updated_at'>
  ): Promise<void> {
    await api.put(`/admin/known-bugs/${id}`, bug);
  },

  // Admin only: Delete known bug
  async deleteKnownBug(id: number): Promise<void> {
    await api.delete(`/admin/known-bugs/${id}`);
  },
};
