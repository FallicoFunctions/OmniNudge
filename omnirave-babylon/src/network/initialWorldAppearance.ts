import { hasAvatarLoadout } from '../player/avatarDefinition';
import { parseCompleteAvatarLoadout } from '../player/completeAvatarLoadout';
import type { WorldSnapshot, WorldSocketStatus } from './worldSocket';

/** Read a direct launch's saved look before publishing this client's appearance. */
export function createInitialWorldAppearance(options: {
  sessionAppearanceRestored: boolean;
  restore: (loadout: Record<string, string>) => Promise<void>;
  publish: () => void;
}) {
  let firstSnapshot = true;
  let restoreSavedAppearance = !options.sessionAppearanceRestored;
  let connection = 0;
  let ready = false;
  let disposed = false;
  return {
    get ready() { return ready && !disposed; },
    status(status: WorldSocketStatus) {
      if (status === 'connecting' || status === 'closed' || status === 'error') {
        connection++;
        firstSnapshot = true;
        ready = false;
      }
    },
    async snapshot(snapshot: WorldSnapshot) {
      if (disposed || !firstSnapshot) return;
      const local = snapshot.players.find(player => player.id === snapshot.currentPlayerId);
      if (!local) return;
      firstSnapshot = false;
      const revision = connection;
      const restore = restoreSavedAppearance && hasAvatarLoadout(local.loadout)
        && (local.mode === 'account' || parseCompleteAvatarLoadout(local.loadout));
      restoreSavedAppearance = false;
      if (restore) await options.restore({ ...local.loadout });
      if (disposed) return;
      if (revision === connection) ready = true;
      // A network reconnect can finish while the first model still loads.
      // Publish on that new connection as soon as restoration completes.
      if (ready) options.publish();
    },
    dispose() { disposed = true; ready = false; connection++; },
  };
}
