/**
 * P0-035: User Feedback Service
 *
 * Handles feedback submission to the backend API.
 */

import api from './api';

export interface FeedbackRequest {
  rating?: number; // 1-5, optional
  category: 'bug' | 'feature_request' | 'other';
  message: string;
  page_url?: string;
  screenshot_url?: string;
}

export interface FeedbackResponse {
  id: number;
  message: string;
}

class FeedbackService {
  /**
   * Submit user feedback
   */
  async submitFeedback(feedback: FeedbackRequest): Promise<FeedbackResponse> {
    const response = await api.post<FeedbackResponse>('/feedback', feedback);
    return response.data;
  }
}

export const feedbackService = new FeedbackService();
