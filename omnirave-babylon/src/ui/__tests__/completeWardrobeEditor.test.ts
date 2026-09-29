import { expect, it, vi } from 'vitest';
import { DEFAULT_AVATAR_DEFINITION } from '../../player/avatarDefinition';
import type { CompleteAvatarWardrobe } from '../../player/completeAvatarWardrobe';
import type { ModularAvatarSlot } from '../../player/modularAvatarContract';
import { createTopLeftControls } from '../createTopLeftControls';

it('routes the venue Avatar panel to actual part visibility without writing account loadouts', () => {
  const slots = ['hair', 'jacket', 'accessories'] as const;
  const visible = new Map<ModularAvatarSlot, boolean>(slots.map(slot => [slot, true]));
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const wardrobe: CompleteAvatarWardrobe = {
    saveState: 'session',
    slots, isVisible: slot => visible.get(slot) === true,
    setVisible(slot, state) { visible.set(slot, state); notify(); },
    reset() { slots.forEach(slot => visible.set(slot, true)); notify(); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { listeners.clear(); },
  };
  const onChange = vi.fn(); const host = document.createElement('div'); document.body.appendChild(host);
  const controls = createTopLeftControls(host, { avatarDefinition: DEFAULT_AVATAR_DEFINITION, completeWardrobe: wardrobe, onAvatarDefinitionChange: onChange });
  controls.openPanel('avatar');
  const panel = host.querySelector<HTMLElement>('[aria-label="Avatar editor"]')!;
  expect(panel.hidden).toBe(false);
  expect(panel.querySelectorAll('input[type=checkbox]')).toHaveLength(3);
  expect(panel.querySelectorAll('select,input[type=range]')).toHaveLength(0);
  expect(panel.querySelector('[role="status"]')!.textContent).toContain('Browser saving is unavailable');
  Object.defineProperty(wardrobe, 'saveState', { value: 'saved' }); notify();
  expect(panel.querySelector('[role="status"]')!.textContent).toBe('Outfit saved in this browser for this character.');
  const jacket = Array.from(panel.querySelectorAll('label')).find(label => label.textContent === 'Jacket')!.querySelector('input')!;
  jacket.click(); expect(wardrobe.isVisible('jacket')).toBe(false);
  wardrobe.setVisible('jacket', true); expect(jacket.checked).toBe(true);
  wardrobe.setVisible('hair', false);
  panel.querySelector<HTMLButtonElement>('button')!.click();
  expect(slots.every(slot => wardrobe.isVisible(slot))).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  controls.dispose(); expect(listeners.size).toBe(0); expect(host.children).toHaveLength(0); host.remove();
});

it('rebinds the panel after a saved character arrives and removes stale wardrobe listeners', () => {
  const host = document.createElement('div'); document.body.appendChild(host);
  const listeners = new Set<() => void>();
  const wardrobe: CompleteAvatarWardrobe = {
    slots:['jacket'], isVisible:() => false, setVisible:vi.fn(), reset:vi.fn(), dispose:vi.fn(),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const controls = createTopLeftControls(host, { avatarEditorEnabled:false, avatarDefinition:DEFAULT_AVATAR_DEFINITION });
  expect(host.textContent).not.toContain('Avatar');
  controls.setCompleteWardrobe(wardrobe);
  controls.openPanel('avatar');
  expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
  expect(listeners.size).toBe(1);
  const oldCheckbox = host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  controls.setCompleteWardrobe(undefined);
  expect(listeners.size).toBe(0); expect(controls.activePanel()).toBe(null);
  expect(host.querySelector('[aria-label="Avatar editor"]')).toBeNull();
  oldCheckbox.click(); expect(wardrobe.setVisible).not.toHaveBeenCalled();
  controls.dispose(); host.remove();
});
