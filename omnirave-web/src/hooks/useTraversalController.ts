import { useState } from 'react';
import type { RuntimeMode, RuntimePoint } from '../lib/session';
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../lib/traversal';

type TraversalState = {
  position: RuntimePoint;
  stamina: number;
  isSprinting: boolean;
  isCrouched: boolean;
  zoom: number;
};

function clampZoom(nextZoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
}

export function useTraversalController(input: { mode: RuntimeMode; initialPosition: RuntimePoint }) {
  const [state, setState] = useState<TraversalState>({
    position: input.initialPosition,
    stamina: 1,
    isSprinting: false,
    isCrouched: false,
    zoom: DEFAULT_ZOOM,
  });

  function setKeyState(code: string, pressed: boolean) {
    setState((current) => {
      if (code === 'ShiftLeft' || code === 'ShiftRight') {
        if (!pressed) {
          return { ...current, isSprinting: false };
        }

        if (input.mode === 'guest') {
          return { ...current, isSprinting: false, stamina: 1 };
        }

        return { ...current, isSprinting: true };
      }

      return current;
    });
  }

  return {
    state,
    setKeyState,
    setPosition(position: RuntimePoint) {
      setState((current) => ({ ...current, position }));
    },
    adjustZoom(delta: number) {
      setState((current) => ({ ...current, zoom: clampZoom(current.zoom + delta) }));
    },
    reset(position: RuntimePoint) {
      setState((current) => ({
        ...current,
        position,
        stamina: 1,
        isSprinting: false,
        isCrouched: false,
      }));
    },
  };
}
