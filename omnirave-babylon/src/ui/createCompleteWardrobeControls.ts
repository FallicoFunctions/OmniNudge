import type { CompleteAvatarWardrobe } from '../player/completeAvatarWardrobe';
import type { ModularAvatarSlot } from '../player/modularAvatarContract';
import type { AvatarProfileSaveView } from '../network/avatarProfileSave';

const LABELS: Record<ModularAvatarSlot, string> = {
  hair: 'Hair', top: 'Top', jacket: 'Jacket', bottoms: 'Bottoms', shoes: 'Shoes', accessories: 'Accessories',
};

/** Uses the loaded outfit's own parts; no substitute catalog or recoloring. */
export function createCompleteWardrobeControls(wardrobe: CompleteAvatarWardrobe, profileSave?: AvatarProfileSaveView, onSignIn?: () => void) {
  const element = document.createElement('fieldset');
  element.className = 'avatar-editor__section';
  const legend = document.createElement('legend');
  legend.textContent = 'Outfit parts'; element.appendChild(legend);
  const saveStatus = document.createElement('p');
  saveStatus.className = 'avatar-editor__intro'; saveStatus.setAttribute('role', 'status');
  element.appendChild(saveStatus);
  const inputs = new Map<ModularAvatarSlot, HTMLInputElement>();
  const disposers: (() => void)[] = [];
  for (const slot of wardrobe.slots) {
    const label = document.createElement('label');
    label.className = 'avatar-editor__field';
    const input = document.createElement('input'); input.type = 'checkbox';
    const text = document.createElement('span'); text.textContent = LABELS[slot];
    const change = () => wardrobe.setVisible(slot, input.checked);
    input.addEventListener('change', change);
    disposers.push(() => input.removeEventListener('change', change));
    label.append(input, text); element.appendChild(label); inputs.set(slot, input);
  }
  const reset = document.createElement('button'); reset.type = 'button';
  reset.textContent = 'Restore full outfit'; reset.className = 'hud-button';
  const restore = () => wardrobe.reset(); reset.addEventListener('click', restore);
  disposers.push(() => reset.removeEventListener('click', restore)); element.appendChild(reset);
  const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'hud-button';
  const retrySave = () => profileSave?.status === 'expired' ? onSignIn?.() : profileSave?.retry();
  retry.addEventListener('click', retrySave);
  disposers.push(() => retry.removeEventListener('click', retrySave)); element.appendChild(retry);
  const sync = () => {
    for (const [slot, input] of inputs) input.checked = wardrobe.isVisible(slot);
    const profileMessages = {
      session: 'Changes last for this session.', idle: 'Changes save to your account.',
      saving: 'Saving outfit…', saved: 'Outfit saved to your account.',
      error: 'Your outfit could not be saved. Your changes are still visible here.',
      expired: 'Sign in again to save your outfit. Your changes are still visible here.',
    };
    saveStatus.textContent = profileSave ? profileMessages[profileSave.status] : wardrobe.saveState === 'saved'
      ? 'Outfit saved in this browser for this character.'
      : 'Changes last for this session. Browser saving is unavailable.';
    retry.hidden = profileSave?.status !== 'error' && !(profileSave?.status === 'expired' && onSignIn);
    retry.textContent = profileSave?.status === 'expired' ? 'Sign in to save' : 'Retry save';
  };
  if (profileSave) disposers.push(profileSave.subscribe(sync));
  disposers.push(wardrobe.subscribe(sync)); sync();
  return { element, dispose() { disposers.forEach(dispose => dispose()); element.remove(); } };
}
