import { api } from '../lib/api';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'illegal_content',
  'csam',
  'violence',
  'hate_speech',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = 'post' | 'comment' | 'user' | 'message' | 'reddit_comment';

const reportReasonSet = new Set<string>(REPORT_REASONS);

export function normalizeReportReason(input: string): ReportReason | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!normalized) {
    return 'other';
  }

  if (normalized === 'illegal') {
    return 'illegal_content';
  }
  if (normalized === 'hate') {
    return 'hate_speech';
  }

  return reportReasonSet.has(normalized) ? (normalized as ReportReason) : null;
}

export function buildUserReport(
  reasonInput: string,
  detailsInput?: string | null
): { reason: ReportReason; description?: string } {
  const trimmedReasonInput = reasonInput.trim();
  const normalizedReason = normalizeReportReason(trimmedReasonInput);
  const reason = normalizedReason ?? 'other';
  const detailsParts: string[] = [];

  if (!normalizedReason && trimmedReasonInput) {
    detailsParts.push(trimmedReasonInput);
  }
  if (detailsInput?.trim()) {
    detailsParts.push(detailsInput.trim());
  }

  return {
    reason,
    description: detailsParts.join('\n\n') || undefined,
  };
}

export const reportService = {
  async createReport(payload: {
    targetType: ReportTargetType;
    targetId: number;
    reason: ReportReason;
    description?: string;
  }): Promise<void> {
    const description = payload.description?.trim();
    await api.post('/reports', {
      target_type: payload.targetType,
      target_id: payload.targetId,
      reason: payload.reason,
      ...(description ? { description } : {}),
    });
  },
};
