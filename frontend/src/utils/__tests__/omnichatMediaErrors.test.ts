import { describe, expect, it } from 'vitest';
import { mediaGenerationErrorMessage } from '../omnichatMediaErrors';

describe('mediaGenerationErrorMessage', () => {
  it.each([
    [400, undefined, 'The media request is invalid. Add a prompt and try again.'],
    [402, undefined, 'Media generation requires OmniCredits.'],
    [429, undefined, 'Media generation is rate-limited. Please try again shortly.'],
    [
      undefined,
      'queue_unavailable',
      'The local media worker is offline. Start the backend worker, then retry.',
    ],
    [
      undefined,
      'provider_unavailable',
      'The media GPU endpoint is unavailable. Check the RunPod endpoint settings, then retry.',
    ],
    [
      undefined,
      'provider_result_invalid',
      'The media provider returned no usable file. Check the RunPod output storage, then retry.',
    ],
    [
      undefined,
      'provider_failed',
      'The media GPU worker failed. Check its RunPod endpoint environment, then retry.',
    ],
  ])('maps %s/%s to actionable copy', (status, code, expected) => {
    expect(mediaGenerationErrorMessage(status, code)).toBe(expected);
  });

  it('does not expose provider internals for unknown failures', () => {
    expect(mediaGenerationErrorMessage(500)).toBe(
      'Media generation is temporarily unavailable. Please try again shortly.'
    );
    expect(mediaGenerationErrorMessage(undefined, 'secret-provider-stack')).toBe(
      'Media generation could not be started. Please try again.'
    );
  });
});

describe('distinct 5xx causes', () => {
  it('separates server-side request tracking failures from provider outages', () => {
    // A missing scope in the idempotency CHECK constraint made /photo fail
    // permanently while reading as a transient provider blip.
    expect(mediaGenerationErrorMessage(503, 'replay_protection_unavailable')).toContain(
      'server problem'
    );
    expect(mediaGenerationErrorMessage(503, 'replay_completion_failed')).toContain(
      'server problem'
    );
    expect(mediaGenerationErrorMessage(503, 'generation_not_configured')).toContain(
      'not configured'
    );
    expect(mediaGenerationErrorMessage(503, 'generation_unavailable')).toContain(
      'media service rejected'
    );
  });

  it('names a content block instead of calling it an outage', () => {
    expect(mediaGenerationErrorMessage(422, 'safety_rejected')).toContain('content filter');
  });

  it('still falls back for an unrecognised 5xx', () => {
    expect(mediaGenerationErrorMessage(500, 'something_new')).toContain('temporarily unavailable');
  });
});
