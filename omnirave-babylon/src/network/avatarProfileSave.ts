const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';

export type AvatarProfileSaveStatus = 'session' | 'idle' | 'saving' | 'saved' | 'error' | 'expired';

export class AvatarProfileSaveError extends Error {
  constructor(readonly requiresLogin: boolean) {
    super(requiresLogin ? 'Sign in again to save your outfit.' : 'Your outfit could not be saved.');
  }
}

/** The account token stays in memory and is sent only to the configured profile API. */
export async function saveAvatarProfileLoadout(token: string, loadout: Record<string, string>, signal: AbortSignal): Promise<void> {
  const response = await fetch(`${OMNIGAME_API_URL}/omnigame/profile/omnirave/loadout`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
    body: JSON.stringify(loadout),
  });
  if (response.status !== 204) throw new AvatarProfileSaveError(response.status === 401 || response.status === 403);
}

export interface AvatarProfileSaveView {
  readonly status: AvatarProfileSaveStatus;
  subscribe(listener: () => void): () => void;
  retry(): void;
}

/** Coalesce rapid edits, write in order, and isolate each authenticated session. */
export function createAvatarProfileSaver(options: {
  save?: typeof saveAvatarProfileLoadout;
  delayMs?: number;
  timeoutMs?: number;
} = {}) {
  const save = options.save ?? saveAvatarProfileLoadout;
  const listeners = new Set<() => void>();
  let status: AvatarProfileSaveStatus = 'session';
  let token: string | undefined;
  let generation = 0;
  let disposed = false;
  let desired: Record<string, string> | undefined;
  let submitted: Record<string, string> | undefined;
  let lastSaved: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let controller: AbortController | undefined;
  const fingerprint = (loadout: Record<string, string>) => JSON.stringify(Object.entries(loadout).sort(([a], [b]) => a.localeCompare(b)));
  const setStatus = (next: AvatarProfileSaveStatus) => {
    if (status === next) return;
    status = next; listeners.forEach(listener => listener());
  };
  const cancelTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };

  function drain(): Promise<void> {
    if (inFlight) return inFlight;
    if (!token || !desired || disposed || status === 'expired') return Promise.resolve();
    const revision = generation;
    const accountToken = token;
    inFlight = (async () => {
      while (desired && revision === generation && !disposed) {
        const loadout = desired; desired = undefined; submitted = loadout;
        controller = new AbortController();
        const request = controller;
        const timeout = setTimeout(() => request.abort(), options.timeoutMs ?? 8_000);
        setStatus('saving');
        try {
          await save(accountToken, loadout, request.signal);
          if (revision !== generation || disposed) return;
          lastSaved = fingerprint(loadout);
          submitted = undefined;
          if (desired && fingerprint(desired) === lastSaved) desired = undefined;
          setStatus(desired ? 'saving' : 'saved');
        } catch (error) {
          if (revision !== generation || disposed) return;
          desired ??= loadout;
          submitted = undefined;
          setStatus(error instanceof AvatarProfileSaveError && error.requiresLogin ? 'expired' : 'error');
          break;
        } finally { clearTimeout(timeout); }
      }
    })().finally(() => { if (revision === generation) { inFlight = undefined; controller = undefined; } });
    return inFlight;
  }

  return {
    get status() { return status; },
    subscribe(listener: () => void) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    setSession(accountToken?: string) {
      generation++; cancelTimer(); controller?.abort();
      token = disposed ? undefined : accountToken;
      desired = submitted = undefined; lastSaved = undefined; inFlight = undefined; controller = undefined;
      setStatus(token ? 'idle' : 'session');
    },
    queue(loadout: Record<string, string>) {
      if (disposed || !token) return;
      const next = { ...loadout };
      if (!desired && !submitted && fingerprint(next) === lastSaved) return;
      desired = next;
      if (status === 'expired') return;
      cancelTimer(); setStatus('saving');
      timer = setTimeout(() => { timer = undefined; void drain(); }, options.delayMs ?? 400);
    },
    getPendingLoadout() { const pending = desired ?? submitted; return pending ? { ...pending } : undefined; },
    async flush(): Promise<boolean> {
      cancelTimer();
      const revision = generation;
      await drain();
      return revision === generation && !desired && !submitted;
    },
    retry() { if (status === 'error') { cancelTimer(); void drain(); } },
    dispose() {
      if (disposed) return;
      disposed = true; generation++; cancelTimer(); controller?.abort();
      token = undefined; desired = submitted = undefined; inFlight = undefined; listeners.clear();
    },
  };
}
