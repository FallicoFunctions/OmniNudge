/**
 * The locale key to show when a message send fails, or undefined when the page
 * has nothing more useful to say than its own failure state.
 */
export function messageSendErrorKey(status?: number): string | undefined {
  // 404 and 403 mean the recipient cannot be messaged (a block exists); the copy
  // must not reveal that a block is in place.
  if (status === 404 || status === 403) return 'messages.errors.userUnavailable';
  if (status === 429) return 'messages.errors.sendingTooFast';
  return undefined;
}
