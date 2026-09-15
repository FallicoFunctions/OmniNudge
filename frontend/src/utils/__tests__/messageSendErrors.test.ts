import { describe, expect, it } from 'vitest';
import { messageSendErrorKey } from '../messageSendErrors';

describe('messageSendErrorKey', () => {
  it.each([
    [404, 'messages.errors.userUnavailable'],
    [403, 'messages.errors.userUnavailable'],
    [429, 'messages.errors.sendingTooFast'],
    [500, undefined],
    [undefined, undefined],
  ])('maps %s to %s', (status, expected) => {
    expect(messageSendErrorKey(status)).toBe(expected);
  });
});
