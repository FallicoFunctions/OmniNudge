import { describe, expect, it } from 'vitest';
import { MessageNotSent, messageSendErrorKey } from '../messageSendErrors';

const withStatus = (status: number) => Object.assign(new Error('failed'), { status });

describe('messageSendErrorKey', () => {
  it.each([
    [404, 'messages.errors.userUnavailable'],
    [403, 'messages.errors.userUnavailable'],
    [429, 'messages.errors.sendingTooFast'],
    [500, undefined],
  ])('maps status %s to %s', (status, expected) => {
    expect(messageSendErrorKey(withStatus(status))).toBe(expected);
  });

  it('says nothing for an error it does not recognise, or for none at all', () => {
    expect(messageSendErrorKey(new Error('boom'))).toBeUndefined();
    expect(messageSendErrorKey(undefined)).toBeUndefined();
  });

  // A refusal never reached the server, so it carries no status. Reading only
  // the status would leave the user staring at a message that never sent and
  // no reason why.
  it.each([
    ['recipient-key-unusable', 'messages.errors.recipientKeyNotFound'],
    ['no-own-keys', 'messages.errors.encryptionKeysMissing'],
    ['encryption-failed', 'messages.errors.encryptionFailed'],
  ] as const)('names the refusal %s', (refusal, expected) => {
    expect(messageSendErrorKey(new MessageNotSent(refusal, 'not sent'))).toBe(expected);
  });
});
