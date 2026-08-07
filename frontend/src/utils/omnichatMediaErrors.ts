/**
 * Converts safe API/job media failure signals into actionable UI copy.
 * Provider internals are intentionally never shown to the browser.
 */
export function mediaGenerationErrorMessage(status?: number, errorCode?: string): string {
  if (status === 400) return 'The media request is invalid. Add a prompt and try again.';
  if (status === 402) return 'Media generation requires OmniCredits.';
  if (status === 409) return 'This media request is already in progress.';
  if (status === 429) return 'Media generation is rate-limited. Please try again shortly.';

  switch (errorCode) {
    // Distinct server-side 503 causes. These previously all collapsed into one
    // generic "temporarily unavailable", which hid a completely broken /photo
    // command behind the same wording as a transient provider blip.
    case 'replay_protection_unavailable':
    case 'replay_completion_failed':
      return 'Media request tracking failed. This is a server problem, not a provider outage — check the backend logs.';
    case 'generation_not_configured':
      return 'Media generation is not configured on the server. Check the media provider settings.';
    case 'generation_unavailable':
      return 'The media service rejected the request. Check the media provider configuration, then retry.';
    case 'safety_rejected':
      return 'This request was blocked by the content filter and cannot be generated.';
    case 'queue_unavailable':
      return 'The local media worker is offline. Start the backend worker, then retry.';
    case 'provider_unavailable':
      return 'The media GPU endpoint is unavailable. Check the RunPod endpoint settings, then retry.';
    case 'provider_timed_out':
      return 'The media GPU timed out before it returned a result. Retry the request.';
    case 'provider_result_invalid':
      return 'The media provider returned no usable file. Check the RunPod output storage, then retry.';
    case 'storage_quota_exceeded':
      return 'Your media storage is full. Delete an item from the gallery and retry.';
    case 'provider_failed':
      return 'The media GPU worker failed. Check its RunPod endpoint environment, then retry.';
    default:
      return status !== undefined && status >= 500
        ? 'Media generation is temporarily unavailable. Please try again shortly.'
        : 'Media generation could not be started. Please try again.';
  }
}
