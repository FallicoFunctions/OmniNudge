import type { CompleteAvatarDetail } from './completeAvatarLod';
import type { ReviewAvatar } from './createReviewAvatar';
import { applyAvatarDefinition } from './applyAvatarDefinition';
import { parseAvatarLoadout, type AvatarDefinition } from './avatarDefinition';
import { applyCompleteAvatarLoadout, normalizeLaunchAvatarLoadout, parseCompleteAvatarLoadout } from './completeAvatarLoadout';
import { releaseReviewAvatar } from './releaseReviewAvatar';

interface Options {
  initial: ReviewAvatar;
  load: (character: 'male' | 'female' | null) => Promise<ReviewAvatar>;
  loadDetail?: (character: 'male' | 'female', detail: CompleteAvatarDetail) => Promise<ReviewAvatar>;
  /** Attach the replacement and update presence before the old body is released. */
  commit: (avatar: ReviewAvatar, definition: AvatarDefinition, replaced: boolean) => void;
  /** Explicit local design previews retain their chosen character and wardrobe. */
  lockedPreview?: boolean;
  /** Normal gameplay always uses the authored launch pair, including older profiles. */
  launchCharacters?: boolean;
}

/** One current local body; an obsolete session must never replace a newer one. */
export function createLocalAvatarAppearance(options: Options) {
  let current = options.initial;
  let generation = 0;
  let disposed = false;
  let applying = false;
  let pendingDetail: CompleteAvatarDetail | undefined;
  let retryAfter = 0;
  const listeners = new Set<() => void>();
  const detail = (): CompleteAvatarDetail => current.root.metadata?.avatarCompleteDetail ?? 0;
  const replace = (next: ReviewAvatar, definition: AvatarDefinition) => {
    const previous = current;
    const replaced = next !== previous;
    if (replaced) {
      next.root.parent = previous.root.parent;
      next.root.position.copyFrom(previous.root.position);
      next.root.rotation.copyFrom(previous.root.rotation);
      next.root.rotationQuaternion = previous.root.rotationQuaternion?.clone() ?? null;
      next.root.scaling.copyFrom(previous.root.scaling);
    }
    options.commit(next, definition, replaced);
    current = next;
    if (replaced) {
      releaseReviewAvatar(previous);
      for (const listener of listeners) listener();
    }
  };
  return {
    get avatar() { return current; },
    get detail() { return detail(); },
    subscribe(listener: () => void) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    updateDetail(nextDetail: CompleteAvatarDetail): Promise<boolean> | undefined {
      if (disposed || options.lockedPreview || !options.loadDetail || applying) return;
      const character = current.root.metadata?.avatarCompleteCharacter;
      if (character !== 'male' && character !== 'female') return;
      if (nextDetail === detail()) {
        if (pendingDetail !== undefined) { generation++; pendingDetail = undefined; }
        return;
      }
      if (pendingDetail === nextDetail || performance.now() < retryAfter) return;
      const version = ++generation;
      pendingDetail = nextDetail;
      return options.loadDetail(character, nextDetail).then(next => {
        if (disposed || version !== generation) { releaseReviewAvatar(next); return false; }
        try {
          // Read the current outfit now: it may have changed during the download.
          if (current.wardrobe && next.wardrobe) for (const slot of current.wardrobe.slots)
            next.wardrobe.setVisible(slot, current.wardrobe.isVisible(slot));
          const definition = applyAvatarDefinition(next, parseAvatarLoadout({ av: '1', bb: character === 'male' ? 'm' : 'f' }));
          replace(next, definition);
          pendingDetail = undefined; retryAfter = 0;
          return true;
        } catch (error) {
          if (next !== current) releaseReviewAvatar(next);
          throw error;
        }
      }).catch(() => {
        if (!disposed && version === generation) { pendingDetail = undefined; retryAfter = performance.now() + 5000; }
        return false;
      });
    },
    async apply(loadout: Record<string, string>): Promise<boolean> {
      const version = ++generation;
      if (disposed) return false;
      applying = true; pendingDetail = undefined;
      const desired = options.launchCharacters ? normalizeLaunchAvatarLoadout(loadout) : { ...loadout };
      const look = options.lockedPreview ? null : parseCompleteAvatarLoadout(desired);
      const currentCharacter = current.root.metadata?.avatarCompleteCharacter ?? null;
      let next = current;
      try {
        if (!options.lockedPreview && (look?.character ?? null) !== currentCharacter) {
          next = await options.load(look?.character ?? null);
          if (disposed || version !== generation) {
            releaseReviewAvatar(next);
            return false;
          }
        }
        const definition = applyAvatarDefinition(next, parseAvatarLoadout(desired));
        if (look && next.wardrobe) applyCompleteAvatarLoadout(next.wardrobe, look);
        replace(next, definition);
        return true;
      } catch (error) {
        if (next !== current) releaseReviewAvatar(next);
        if (!disposed && version === generation) console.warn('[avatar] Could not restore the saved appearance; keeping the current avatar.', error);
        return false;
      } finally { if (version === generation) applying = false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++; listeners.clear();
      releaseReviewAvatar(current);
    },
  };
}
