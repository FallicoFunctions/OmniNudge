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
    // The render happened. It is the check that could not run, and saying
    // "could not be started" about a job that ran for eighty-three seconds
    // sends whoever reads it to the wrong end of the system.
    case 'image_review_unavailable':
      return 'The render finished but could not be safety-checked, so it was discarded. Check the image review model settings, then retry.';
    case 'scanner_unavailable':
      return 'The render finished but could not be virus-scanned, so it was discarded. Check the scanner, then retry.';
    case 'malware_detected':
      return 'The generated file failed its security scan and was discarded.';
    // The render happened and was refused on what it showed. Saying "could not
    // be started" about it sends the reader to the wrong end of the system --
    // and this one has an answer the reader can act on.
    case 'explicit_content_refused':
      return 'The picture came out explicit, and adult content is turned off for your account. Turn it on in Settings, or describe a less explicit scene.';
    case 'portrait_standard_refused':
      return 'The portrait did not meet the framing standard for a character portrait. Try generating it again.';
    case 'reference_standard_refused':
      return 'The picture did not meet the standard for an identity reference. Try generating it again.';
    case 'persona_not_found':
      return 'That character is no longer available.';
    case 'persona_reference_unavailable':
      return "The character's reference pictures could not be read, so the render would not have looked like her.";
    case 'source_unavailable':
    case 'source_unreachable':
      return 'The picture this was going to animate could not be read. Pick another one from the gallery.';
    case 'invalid_provider_request':
    case 'provider_state_invalid':
      return 'The media service rejected the request as malformed. This is a server problem — check the backend logs.';
    case 'job_not_found':
      return 'This media request no longer exists.';
    case 'provider_cancelled':
      return 'This media request was cancelled.';
    default:
      return status !== undefined && status >= 500
        ? 'Media generation is temporarily unavailable. Please try again shortly.'
        : 'Media generation could not be started. Please try again.';
  }
}
