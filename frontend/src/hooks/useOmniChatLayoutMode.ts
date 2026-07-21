import { useCallback, useEffect, useState } from 'react';

export type OmniChatLayoutMode = 'immersive' | 'shared-nav';

const STORAGE_KEY = 'omnichat_layout_mode';
const DEFAULT_MODE: OmniChatLayoutMode = 'immersive';

function readStoredMode(): OmniChatLayoutMode {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'shared-nav' ? 'shared-nav' : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

// OmniChat's dark, image-forward look is a deliberate departure from the rest
// of OmniNudge's theme — this preference controls whether it also takes over
// the full viewport (hiding the shared site nav) or stays docked under it.
// Kept as its own tiny localStorage-backed hook rather than folded into the
// large SettingsContext, since it's a single, narrowly-scoped display choice.
export function useOmniChatLayoutMode() {
  const [mode, setModeState] = useState<OmniChatLayoutMode>(readStoredMode);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage can be disabled in privacy-restricted browser contexts.
    }
  }, [mode]);

  const setMode = useCallback((next: OmniChatLayoutMode) => {
    setModeState(next);
  }, []);

  return { mode, setMode };
}
