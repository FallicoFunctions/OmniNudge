import { afterEach, expect, it, vi } from 'vitest';
import { AvatarProfileSaveError, createAvatarProfileSaver, saveAvatarProfileLoadout } from '../avatarProfileSave';

const outfit = (cw = '110111') => ({ av:'1', cv:'1', cp:'female', cw });
function deferred() {
  let resolve!: () => void; let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('coalesces rapid edits, copies input, and reports saved only after acknowledgment', async () => {
  vi.useFakeTimers(); const request = deferred(); const save = vi.fn(() => request.promise);
  const saver = createAvatarProfileSaver({save}); saver.setSession('account');
  expect(saver.status).toBe('idle');
  saver.queue(outfit()); const latest = outfit('111111'); saver.queue(latest); latest.cw = '000000';
  expect(saver.status).toBe('saving'); expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(400);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]).toEqual(['account',outfit('111111'),expect.any(AbortSignal)]);
  expect(saver.status).toBe('saving');
  request.resolve(); expect(await saver.flush()).toBe(true); expect(saver.status).toBe('saved');
  saver.queue(outfit('111111')); await vi.advanceTimersByTimeAsync(400);
  expect(save).toHaveBeenCalledTimes(1); saver.dispose();
});

it('serializes requests so a slow older save cannot overwrite the newest outfit', async () => {
  vi.useFakeTimers(); const first = deferred(); const second = deferred();
  const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const saver = createAvatarProfileSaver({save}); saver.setSession('account'); saver.queue(outfit());
  await vi.advanceTimersByTimeAsync(400);
  saver.queue(outfit('111111')); saver.queue(outfit('010111'));
  await vi.advanceTimersByTimeAsync(400); expect(save).toHaveBeenCalledTimes(1);
  first.resolve(); await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[1][1]).toEqual(outfit('010111'));
  expect(saver.status).toBe('saving'); second.resolve(); expect(await saver.flush()).toBe(true);
  expect(saver.status).toBe('saved'); saver.dispose();
});

it('retains the latest failed edit for explicit retry', async () => {
  vi.useFakeTimers(); const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const saver = createAvatarProfileSaver({save}); saver.setSession('account'); saver.queue(outfit());
  expect(await saver.flush()).toBe(false); expect(saver.status).toBe('error');
  const pending = saver.getPendingLoadout()!; pending.cw = '000000';
  expect(saver.getPendingLoadout()).toEqual(outfit());
  await vi.advanceTimersByTimeAsync(20_000); expect(save).toHaveBeenCalledTimes(1);
  saver.retry(); expect(await saver.flush()).toBe(true); expect(saver.status).toBe('saved');
  expect(save.mock.calls[1][1]).toEqual(outfit()); saver.dispose();
});

it('keeps editing after expired credentials without repeatedly submitting a rejected token', async () => {
  vi.useFakeTimers(); const save = vi.fn().mockRejectedValue(new AvatarProfileSaveError(true));
  const saver = createAvatarProfileSaver({save}); saver.setSession('expired'); saver.queue(outfit());
  expect(await saver.flush()).toBe(false); expect(saver.status).toBe('expired');
  saver.queue(outfit('111111')); saver.retry(); await vi.advanceTimersByTimeAsync(20_000);
  expect(save).toHaveBeenCalledTimes(1); expect(saver.getPendingLoadout()).toEqual(outfit('111111'));
  saver.dispose();
});

it('isolates account changes, aborts old work, and ignores its late completion', async () => {
  vi.useFakeTimers(); const old = deferred(); const next = deferred();
  const save = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const saver = createAvatarProfileSaver({save}); saver.setSession('alice'); saver.queue(outfit());
  await vi.advanceTimersByTimeAsync(400); const oldSignal = save.mock.calls[0][2] as AbortSignal;
  saver.queue(outfit('000000')); saver.setSession('bob'); expect(oldSignal.aborted).toBe(true);
  saver.queue({...outfit(),cp:'male'}); await vi.advanceTimersByTimeAsync(400);
  old.resolve(); await vi.advanceTimersByTimeAsync(0); expect(saver.status).toBe('saving');
  expect(save.mock.calls.map(call => call[0])).toEqual(['alice','bob']);
  expect(save.mock.calls[1][1]).toEqual({...outfit(),cp:'male'});
  next.resolve(); expect(await saver.flush()).toBe(true); expect(saver.status).toBe('saved'); saver.dispose();
});

it('never submits guest edits and cancels pending/disposed session work', async () => {
  vi.useFakeTimers(); const save = vi.fn().mockResolvedValue(undefined);
  const saver = createAvatarProfileSaver({save}); const listener = vi.fn(); saver.subscribe(listener);
  saver.queue(outfit()); await vi.advanceTimersByTimeAsync(400); expect(save).not.toHaveBeenCalled();
  saver.setSession('alice'); saver.queue(outfit()); saver.setSession();
  await vi.advanceTimersByTimeAsync(400); expect(save).not.toHaveBeenCalled(); expect(saver.status).toBe('session');
  saver.setSession('bob'); saver.queue(outfit()); saver.dispose(); const notifications = listener.mock.calls.length;
  await vi.advanceTimersByTimeAsync(400); saver.queue(outfit()); expect(save).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(notifications);
});

it('flushes without the debounce delay and times out a stalled request', async () => {
  vi.useFakeTimers();
  const save = vi.fn((_token: string, _loadout: Record<string,string>, signal: AbortSignal) => new Promise<void>((_resolve,reject) => {
    signal.addEventListener('abort', () => reject(new Error('timeout')), {once:true});
  }));
  const saver = createAvatarProfileSaver({save,timeoutMs:100}); saver.setSession('account'); saver.queue(outfit());
  const flushing = saver.flush(); expect(save).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100); expect(await flushing).toBe(false);
  expect(saver.status).toBe('error'); expect(saver.getPendingLoadout()).toEqual(outfit()); saver.dispose();
});

it('sends the account token only as a bearer header to the fixed profile endpoint', async () => {
  const fetchMock = vi.fn().mockResolvedValue({status:204}); vi.stubGlobal('fetch',fetchMock);
  const signal = new AbortController().signal;
  await saveAvatarProfileLoadout('profile-token',outfit(),signal);
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:8091/api/v1/omnigame/profile/omnirave/loadout', {
    method:'PUT', headers:{'Content-Type':'application/json',Authorization:'Bearer profile-token'},
    credentials:'omit',redirect:'error',cache:'no-store',signal,body:JSON.stringify(outfit()),
  });
});

it('distinguishes rejected credentials from a failed or unexpected save response', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch',fetchMock);
  for (const status of [401,403,500,200]) {
    fetchMock.mockResolvedValue({status});
    await expect(saveAvatarProfileLoadout('token',outfit(),new AbortController().signal))
      .rejects.toMatchObject({requiresLogin:status===401 || status===403});
  }
});
