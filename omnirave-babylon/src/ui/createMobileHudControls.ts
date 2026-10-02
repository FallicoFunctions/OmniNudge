import type { ChatPanel } from './createChatPanel';

export const MOBILE_HUD_QUERY = '(max-width: 760px), (pointer: coarse)';

/** Whole-panel drawers, distinct from the desktop chat history preference. */
export function createMobileHudControls(host: HTMLElement, options: {
  chat?: Pick<ChatPanel, 'element' | 'setMobileHidden'>;
  nowPlaying: HTMLElement;
  onLayoutChange?: () => void;
  media?: MediaQueryList;
}): { dispose: () => void } {
  const media = options.media ?? window.matchMedia?.(MOBILE_HUD_QUERY);
  const visualViewport = window.visualViewport;
  const controls = document.createElement('div');
  controls.className = 'mobile-hud-controls';
  controls.dataset.testid = 'mobile-hud-controls';
  const entries = [
    ...(options.chat ? [{ name: 'Chat', key: 'chat', panel: options.chat.element }] : []),
    { name: 'Now Playing', key: 'now-playing', panel: options.nowPlaying },
  ].map(entry => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `hud-button mobile-hud-toggle mobile-hud-toggle--${entry.key}`;
    button.dataset.testid = `mobile-toggle-${entry.key}`;
    button.textContent = entry.name;
    entry.panel.id ||= `mobile-panel-${entry.key}`;
    button.setAttribute('aria-controls', entry.panel.id);
    controls.appendChild(button);
    return { ...entry, button, open: false, click: () => {} };
  });
  host.append(controls);

  const layout = () => {
    // Keep drawers above the software keyboard on browsers whose layout
    // viewport stays full-height while the visible viewport shrinks.
    if (visualViewport && visualViewport.scale === 1) {
      host.style.setProperty('--mobile-viewport-height', `${visualViewport.height}px`);
    } else host.style.removeProperty('--mobile-viewport-height');
    options.onLayoutChange?.();
  };

  const render = () => {
    const mobile = media?.matches ?? false;
    host.classList.toggle('babylon-runtime-host--mobile', mobile);
    controls.hidden = !mobile;
    for (const entry of entries) {
      const hidden = mobile && !entry.open;
      if (entry.key === 'chat') options.chat?.setMobileHidden(hidden, mobile);
      entry.panel.classList.toggle('mobile-panel--hidden', hidden);
      entry.panel.inert = hidden;
      if (hidden) entry.panel.setAttribute('aria-hidden', 'true');
      else entry.panel.removeAttribute('aria-hidden');
      entry.button.setAttribute('aria-expanded', String(mobile && entry.open));
      entry.button.setAttribute('aria-label', `${entry.open ? 'Hide' : 'Show'} ${entry.name}`);
    }
    layout();
  };
  for (const entry of entries) {
    entry.click = () => {
      entry.open = !entry.open;
      // Drawers share the lower screen: opening one tucks the other away.
      if (entry.open) for (const other of entries) if (other !== entry) other.open = false;
      render();
    };
    entry.button.addEventListener('click', entry.click);
  }
  media?.addEventListener('change', render);
  visualViewport?.addEventListener('resize', layout);
  render();
  return {
    dispose() {
      media?.removeEventListener('change', render);
      visualViewport?.removeEventListener('resize', layout);
      host.style.removeProperty('--mobile-viewport-height');
      for (const entry of entries) {
        entry.button.removeEventListener('click', entry.click);
        entry.panel.classList.remove('mobile-panel--hidden');
        entry.panel.inert = false;
        entry.panel.removeAttribute('aria-hidden');
      }
      options.chat?.setMobileHidden(false);
      host.classList.remove('babylon-runtime-host--mobile');
      controls.remove();
    },
  };
}
