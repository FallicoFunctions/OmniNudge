import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_AVATAR_DEFINITION,
  EDITOR_MAX_HEIGHT_INCHES,
} from '../../player/avatarDefinition';
import { createAvatarEditor } from '../createAvatarEditor';

afterEach(() => {
  document.body.replaceChildren();
});

describe('createAvatarEditor', () => {
  it('renders both body bases and every cross-compatible customization category', () => {
    const editor = createAvatarEditor({ definition: DEFAULT_AVATAR_DEFINITION });
    document.body.appendChild(editor.element);

    expect(editor.element.querySelectorAll('[data-avatar-body]')).toHaveLength(2);
    expect(editor.element.querySelectorAll('[data-avatar-field="skinTone"]')).toHaveLength(10);
    expect(editor.element.querySelector('select[data-avatar-field="hairStyle"]')).not.toBeNull();
    expect(editor.element.querySelector('select[data-avatar-field="top"]')).not.toBeNull();
    expect(editor.element.querySelector('select[data-avatar-field="jacket"]')).not.toBeNull();
    expect(editor.element.querySelector('select[data-avatar-field="bottoms"]')).not.toBeNull();
    expect(editor.element.querySelector('select[data-avatar-field="shoes"]')).not.toBeNull();
  });

  it('applies body, height, hair, and outfit edits live as a normalized definition', () => {
    const onChange = vi.fn();
    const editor = createAvatarEditor({ definition: DEFAULT_AVATAR_DEFINITION, onChange });
    document.body.appendChild(editor.element);

    editor.element.querySelector<HTMLButtonElement>('[data-avatar-body="male"]')!.click();
    const height = editor.element.querySelector<HTMLInputElement>('[data-avatar-field="heightInches"]')!;
    height.value = '999';
    height.dispatchEvent(new Event('input'));
    const hair = editor.element.querySelector<HTMLSelectElement>('select[data-avatar-field="hairStyle"]')!;
    hair.value = 'buzz';
    hair.dispatchEvent(new Event('change'));
    const top = editor.element.querySelector<HTMLSelectElement>('select[data-avatar-field="top"]')!;
    top.value = 'graphic-tee';
    top.dispatchEvent(new Event('change'));

    expect(editor.getDefinition()).toMatchObject({
      bodyBase: 'male',
      heightInches: EDITOR_MAX_HEIGHT_INCHES,
      hairStyle: 'buzz',
      top: 'graphic-tee',
    });
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('updates the controls when an account loadout replaces the live definition', () => {
    const editor = createAvatarEditor({ definition: DEFAULT_AVATAR_DEFINITION });
    document.body.appendChild(editor.element);
    editor.setDefinition({
      ...DEFAULT_AVATAR_DEFINITION,
      bodyBase: 'male',
      hairColor: 'ice',
      shoes: 'work-boots',
    });

    expect(editor.element.querySelector('[data-avatar-body="male"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(editor.element.querySelector('[data-avatar-option="ice"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(editor.element.querySelector<HTMLSelectElement>('select[data-avatar-field="shoes"]')?.value).toBe('work-boots');
  });
});
