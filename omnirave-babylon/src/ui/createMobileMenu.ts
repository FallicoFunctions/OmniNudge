import { MOBILE_HUD_QUERY } from './createMobileHudControls';

/** Moves existing action buttons into a mobile menu, retaining their handlers. */
export function createMobileMenu(host: HTMLElement, options: {
  topLeft: HTMLElement;
  topRight: HTMLElement;
  media?: MediaQueryList;
}): { leadingControls: HTMLElement; dispose: () => void } {
  const media = options.media ?? window.matchMedia?.(MOBILE_HUD_QUERY);
  const rows = [options.topLeft, options.topRight].map(parent => {
    const row = parent.querySelector<HTMLElement>('.hud-controls__row')!;
    return { parent, row, next: row.nextSibling };
  });
  // Keep adjacent controls outside the menu so they stay visible on either layout.
  const leadingControls = document.createElement('div');
  leadingControls.className = 'hud-controls__leading';
  options.topRight.appendChild(leadingControls);
  const element = document.createElement('div');
  element.className = 'mobile-menu';
  element.dataset.testid = 'mobile-menu';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-menu__toggle';
  toggle.setAttribute('aria-label', 'Open menu');
  toggle.title = 'Menu · One finger to walk, two fingers to look';
  toggle.setAttribute('aria-expanded', 'false');
  const icon = document.createElement('span');
  icon.className = 'mobile-menu__icon';
  icon.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) icon.appendChild(document.createElement('span'));
  toggle.appendChild(icon);
  const menu = document.createElement('nav');
  menu.id = 'mobile-game-menu';
  menu.className = 'mobile-menu__content';
  menu.setAttribute('aria-label', 'Game menu');
  menu.hidden = true;
  toggle.setAttribute('aria-controls', menu.id);
  const exit = document.createElement('a');
  exit.className = 'mobile-menu__exit';
  exit.href = 'http://omninudge.com/games/omnirave/';
  exit.textContent = 'Exit';
  menu.appendChild(exit);
  element.append(toggle, menu);
  host.appendChild(element);

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  const restore = () => {
    for (const { parent, row, next } of rows) parent.insertBefore(row, next);
  };
  const render = () => {
    const mobile = media?.matches ?? false;
    element.hidden = !mobile;
    setOpen(false);
    if (mobile) {
      element.insertBefore(leadingControls, toggle);
      for (const { row } of rows) menu.insertBefore(row, exit);
    } else {
      options.topRight.appendChild(leadingControls);
      restore();
    }
  };
  const toggleMenu = () => setOpen(menu.hidden === true);
  const choose = (event: MouseEvent) => {
    const action = event.target instanceof Element ? event.target.closest('button, a') : null;
    if (!action || action.getAttribute('data-confirming') === 'true') return;
    setOpen(false);
    if (action instanceof HTMLElement) action.blur();
  };
  const outside = (event: PointerEvent) => {
    if (event.target instanceof Node && !element.contains(event.target)) setOpen(false);
  };
  const escape = (event: KeyboardEvent) => {
    // Let native button/link activation handle Enter and Space without
    // letting the canvas input map turn those keys into movement or jumps.
    if (event.key !== 'Escape') { event.stopPropagation(); return; }
    if (menu.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    toggle.focus();
  };
  const activate = (event: KeyboardEvent) => {
    if (event.code === 'Space' || event.key === 'Enter') event.stopPropagation();
  };
  toggle.addEventListener('click', toggleMenu);
  menu.addEventListener('click', choose);
  element.addEventListener('keydown', escape);
  element.addEventListener('keyup', activate);
  host.ownerDocument.addEventListener('pointerdown', outside);
  media?.addEventListener('change', render);
  render();
  return {
    leadingControls,
    dispose() {
      media?.removeEventListener('change', render);
      toggle.removeEventListener('click', toggleMenu);
      menu.removeEventListener('click', choose);
      element.removeEventListener('keydown', escape);
      element.removeEventListener('keyup', activate);
      host.ownerDocument.removeEventListener('pointerdown', outside);
      restore();
      leadingControls.remove();
      element.remove();
    },
  };
}
