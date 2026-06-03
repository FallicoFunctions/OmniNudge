import { useMemo, useState } from 'react';

export function useMobileMediaUnlock() {
  const [unlocked, setUnlocked] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches,
  );
  const isTouchDevice = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );

  return {
    unlocked,
    isTouchDevice,
    unlock: () => setUnlocked(true),
  };
}
