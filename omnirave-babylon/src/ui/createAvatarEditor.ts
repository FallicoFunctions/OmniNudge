import {
  AVATAR_BOTTOMS,
  AVATAR_HAIR_COLORS,
  AVATAR_HAIR_STYLES,
  AVATAR_JACKETS,
  AVATAR_SHOES,
  AVATAR_SKIN_TONES,
  AVATAR_TOPS,
  DEFAULT_AVATAR_DEFINITION,
  EDITOR_MAX_HEIGHT_INCHES,
  EDITOR_MIN_HEIGHT_INCHES,
  normalizeAvatarDefinition,
  type AvatarDefinition,
  type AvatarOption,
} from '../player/avatarDefinition';

export interface CreateAvatarEditorOptions {
  definition?: AvatarDefinition;
  onChange?: (definition: AvatarDefinition) => void;
}

export interface AvatarEditor {
  element: HTMLElement;
  getDefinition: () => AvatarDefinition;
  setDefinition: (definition: AvatarDefinition) => void;
  dispose: () => void;
}

type OptionField = 'hairStyle' | 'hairColor' | 'skinTone' | 'top' | 'jacket' | 'bottoms' | 'shoes';

/** Pure-DOM, closed-option avatar editor. No untrusted string is inserted as HTML. */
export function createAvatarEditor(options: CreateAvatarEditorOptions = {}): AvatarEditor {
  let definition = normalizeAvatarDefinition(options.definition ?? DEFAULT_AVATAR_DEFINITION);
  const disposers: Array<() => void> = [];

  const panel = document.createElement('section');
  panel.dataset.testid = 'avatar-popup';
  panel.className = 'hud-popup avatar-editor';
  panel.setAttribute('aria-label', 'Avatar editor');

  const header = document.createElement('div');
  header.className = 'avatar-editor__header';
  const heading = document.createElement('h2');
  heading.className = 'hud-popup__title';
  heading.textContent = 'Create your avatar';
  const status = document.createElement('span');
  status.className = 'avatar-editor__status';
  status.textContent = 'Live';
  header.append(heading, status);
  panel.appendChild(header);

  const intro = document.createElement('p');
  intro.className = 'avatar-editor__intro';
  intro.textContent = 'Start with either body, then mix every hairstyle and outfit freely.';
  panel.appendChild(intro);

  const bodySection = createSection('Body');
  const bodyPicker = document.createElement('div');
  bodyPicker.className = 'avatar-editor__body-picker';
  for (const bodyBase of ['male', 'female'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'avatar-editor__body-card';
    button.dataset.avatarBody = bodyBase;
    button.setAttribute('aria-pressed', String(definition.bodyBase === bodyBase));
    const icon = document.createElement('span');
    icon.className = `avatar-editor__body-icon avatar-editor__body-icon--${bodyBase}`;
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = bodyBase === 'male' ? 'Male base' : 'Female base';
    button.append(icon, label);
    const onClick = () => update({ bodyBase });
    button.addEventListener('click', onClick);
    disposers.push(() => button.removeEventListener('click', onClick));
    bodyPicker.appendChild(button);
  }
  bodySection.appendChild(bodyPicker);

  const heightRow = document.createElement('label');
  heightRow.className = 'avatar-editor__height';
  const heightLabel = document.createElement('span');
  heightLabel.textContent = 'Height';
  const heightInput = document.createElement('input');
  heightInput.type = 'range';
  heightInput.min = String(EDITOR_MIN_HEIGHT_INCHES);
  heightInput.max = String(EDITOR_MAX_HEIGHT_INCHES);
  heightInput.step = '1';
  heightInput.value = String(definition.heightInches);
  heightInput.dataset.avatarField = 'heightInches';
  const heightOutput = document.createElement('output');
  heightOutput.className = 'avatar-editor__height-value';
  heightRow.append(heightLabel, heightInput, heightOutput);
  bodySection.appendChild(heightRow);
  const onHeight = () => update({ heightInches: Number(heightInput.value) });
  heightInput.addEventListener('input', onHeight);
  disposers.push(() => heightInput.removeEventListener('input', onHeight));
  panel.appendChild(bodySection);

  const appearanceSection = createSection('Appearance');
  appearanceSection.append(
    createSwatchField('Skin tone', 'skinTone', AVATAR_SKIN_TONES),
    createSelectField('Hair style', 'hairStyle', AVATAR_HAIR_STYLES),
    createSwatchField('Hair color', 'hairColor', AVATAR_HAIR_COLORS),
  );
  panel.appendChild(appearanceSection);

  const wardrobeSection = createSection('Wardrobe');
  wardrobeSection.append(
    createSelectField('Top', 'top', AVATAR_TOPS),
    createSelectField('Jacket', 'jacket', AVATAR_JACKETS),
    createSelectField('Bottoms', 'bottoms', AVATAR_BOTTOMS),
    createSelectField('Shoes', 'shoes', AVATAR_SHOES),
  );
  panel.appendChild(wardrobeSection);

  const freedomNote = document.createElement('p');
  freedomNote.className = 'avatar-editor__note';
  freedomNote.textContent = 'All hair and clothing options work on both body bases.';
  panel.appendChild(freedomNote);

  function createSection(title: string): HTMLElement {
    const section = document.createElement('div');
    section.className = 'avatar-editor__section';
    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'avatar-editor__section-title';
    sectionTitle.textContent = title;
    section.appendChild(sectionTitle);
    return section;
  }

  function createSelectField(labelText: string, field: OptionField, pool: readonly AvatarOption[]): HTMLElement {
    const label = document.createElement('label');
    label.className = 'avatar-editor__field';
    const name = document.createElement('span');
    name.textContent = labelText;
    const select = document.createElement('select');
    select.className = 'hud-select avatar-editor__select';
    select.dataset.avatarField = field;
    for (const option of pool) {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.label;
      select.appendChild(item);
    }
    select.value = definition[field];
    const onChange = () => update({ [field]: select.value });
    select.addEventListener('change', onChange);
    disposers.push(() => select.removeEventListener('change', onChange));
    label.append(name, select);
    return label;
  }

  function createSwatchField(labelText: string, field: OptionField, pool: readonly AvatarOption[]): HTMLElement {
    const group = document.createElement('fieldset');
    group.className = 'avatar-editor__swatch-field';
    const legend = document.createElement('legend');
    legend.textContent = labelText;
    const swatches = document.createElement('div');
    swatches.className = 'avatar-editor__swatches';
    for (const option of pool) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'avatar-editor__swatch';
      swatch.dataset.avatarField = field;
      swatch.dataset.avatarOption = option.id;
      swatch.style.setProperty('--avatar-swatch', option.colorHex);
      swatch.title = option.label;
      swatch.setAttribute('aria-label', option.label);
      swatch.setAttribute('aria-pressed', String(definition[field] === option.id));
      const onClick = () => update({ [field]: option.id });
      swatch.addEventListener('click', onClick);
      disposers.push(() => swatch.removeEventListener('click', onClick));
      swatches.appendChild(swatch);
    }
    group.append(legend, swatches);
    return group;
  }

  function update(patch: Partial<AvatarDefinition>): void {
    definition = normalizeAvatarDefinition({ ...definition, ...patch });
    render();
    options.onChange?.({ ...definition });
  }

  function render(): void {
    for (const button of Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-avatar-body]'))) {
      button.setAttribute('aria-pressed', String(button.dataset.avatarBody === definition.bodyBase));
    }
    heightInput.value = String(definition.heightInches);
    heightOutput.value = formatHeight(definition.heightInches);
    for (const select of Array.from(panel.querySelectorAll<HTMLSelectElement>('select[data-avatar-field]'))) {
      const field = select.dataset.avatarField as OptionField;
      select.value = definition[field];
    }
    for (const swatch of Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-avatar-option]'))) {
      const field = swatch.dataset.avatarField as OptionField;
      swatch.setAttribute('aria-pressed', String(swatch.dataset.avatarOption === definition[field]));
    }
  }

  render();

  return {
    element: panel,
    getDefinition: () => ({ ...definition }),
    setDefinition(next) {
      definition = normalizeAvatarDefinition(next);
      render();
    },
    dispose() {
      for (const dispose of disposers) dispose();
      panel.remove();
    },
  };
}

function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}
