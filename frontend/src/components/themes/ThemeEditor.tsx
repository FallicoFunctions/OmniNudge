import { useEffect, useMemo, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useTheme } from '../../hooks/useTheme';
import { themeService } from '../../services/themeService';
import type { UserTheme } from '../../types/theme';
import { DEFAULT_THEME_VARIABLES, THEME_VARIABLE_GROUPS } from '../../data/themeVariables';

const steps = [
  { id: 'base', title: 'Choose Base Theme', description: 'Start from a predefined or existing theme.' },
  { id: 'info', title: 'Basic Info', description: 'Name and describe your theme.' },
  { id: 'variables', title: 'Customize Variables', description: 'Tweak colors with live preview.' },
  { id: 'review', title: 'Review & Save', description: 'Double-check details before publishing.' },
];

const cloneVariables = (source?: Record<string, string>) => ({
  ...DEFAULT_THEME_VARIABLES,
  ...(source ?? {}),
});

interface ThemeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  initialTheme?: UserTheme | null;
}

const ThemeEditor = ({ isOpen, onClose, initialTheme = null }: ThemeEditorProps) => {
  const {
    predefinedThemes,
    customThemes,
    refreshThemes,
    selectTheme,
  } = useTheme();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedBaseThemeId, setSelectedBaseThemeId] = useState<number | null>(null);
  const [themeName, setThemeName] = useState('');
  const [themeDescription, setThemeDescription] = useState('');
  const [cssVariables, setCssVariables] = useState<Record<string, string>>(cloneVariables());
  const [selectedVariableName, setSelectedVariableName] = useState(
    THEME_VARIABLE_GROUPS[0]?.variables[0]?.name ?? '--color-primary'
  );
  const [setAsActive, setSetAsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableThemes = useMemo(
    () => [...predefinedThemes, ...customThemes],
    [predefinedThemes, customThemes]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (initialTheme) {
      setSelectedBaseThemeId(initialTheme.id);
      setThemeName(initialTheme.theme_name);
      setThemeDescription(initialTheme.theme_description ?? '');
      setCssVariables(cloneVariables(initialTheme.css_variables));
      setSetAsActive(false);
    } else {
      const firstTheme = predefinedThemes[0] ?? availableThemes[0] ?? null;
      setSelectedBaseThemeId(firstTheme?.id ?? null);
      setThemeName('');
      setThemeDescription('');
      setCssVariables(cloneVariables(firstTheme?.css_variables));
      setSetAsActive(true);
    }
    setCurrentStep(0);
    setError(null);
  }, [initialTheme, isOpen, predefinedThemes, availableThemes]);

  if (!isOpen) {
    return null;
  }

  const activeVariableDefinition = useMemo(() => {
    for (const group of THEME_VARIABLE_GROUPS) {
      const match = group.variables.find((variable) => variable.name === selectedVariableName);
      if (match) return match;
    }
    return null;
  }, [selectedVariableName]);

  const activeVariableValue =
    cssVariables[selectedVariableName] ??
    DEFAULT_THEME_VARIABLES[selectedVariableName] ??
    '#000000';

  const handleBaseThemeSelect = (themeId: number) => {
    if (initialTheme) return;
    setSelectedBaseThemeId(themeId);
    const baseTheme = availableThemes.find((theme) => theme.id === themeId);
    setCssVariables(cloneVariables(baseTheme?.css_variables));
  };

  const updateVariable = (variableName: string, value: string) => {
    setCssVariables((prev) => ({
      ...prev,
      [variableName]: value,
    }));
  };

  const validateStep = () => {
    if (steps[currentStep].id === 'base' && !selectedBaseThemeId) {
      setError('Please choose a base theme to continue.');
      return false;
    }

    if (steps[currentStep].id === 'info') {
      if (!themeName.trim()) {
        setError('Theme name is required.');
        return false;
      }
      if (themeName.trim().length > 100) {
        setError('Theme name must be 100 characters or fewer.');
        return false;
      }
    }

    setError(null);
    return true;
  };

  const goToNextStep = () => {
    if (!validateStep()) return;
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goToPreviousStep = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!themeName.trim()) {
      setError('Theme name is required.');
      return;
    }

    if (Object.keys(cssVariables).length > 200) {
      setError('You can only define up to 200 CSS variables.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      let result: UserTheme;
      if (initialTheme) {
        result = await themeService.updateTheme(initialTheme.id, {
          theme_name: themeName.trim(),
          theme_description: themeDescription.trim(),
          css_variables: cssVariables,
        });
      } else {
        result = await themeService.createTheme({
          theme_name: themeName.trim(),
          theme_description: themeDescription.trim(),
          theme_type: 'variable_customization',
          scope_type: 'global',
          css_variables: cssVariables,
          is_public: false,
        });
      }

      await refreshThemes();
      if (setAsActive) {
        await selectTheme(result);
      }
      onClose();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Unable to save theme.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    const step = steps[currentStep];
    switch (step.id) {
      case 'base':
        return (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Choose a predefined theme as your starting point. You can tweak every value later.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {availableThemes.map((theme) => {
                const isSelected = selectedBaseThemeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`rounded-xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/60'
                    } ${initialTheme ? 'cursor-not-allowed opacity-70' : ''}`}
                    onClick={() => handleBaseThemeSelect(theme.id)}
                    disabled={Boolean(initialTheme)}
                  >
                    <p className="text-base font-semibold text-[var(--color-text-primary)]">
                      {theme.theme_name}
                    </p>
                    {theme.theme_description && (
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        {theme.theme_description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      case 'info':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-[var(--color-text-primary)]">
                Theme Name *
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                value={themeName}
                onChange={(event) => setThemeName(event.target.value)}
                maxLength={100}
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Max 100 characters.
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold text-[var(--color-text-primary)]">
                Description
              </label>
              <textarea
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                rows={3}
                value={themeDescription}
                onChange={(event) => setThemeDescription(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input
                type="checkbox"
                checked={setAsActive}
                onChange={(event) => setSetAsActive(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              Set as active theme after saving
            </label>
          </div>
        );
      case 'variables':
        return (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-5">
              {THEME_VARIABLE_GROUPS.map((group) => (
                <div key={group.id}>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {group.name}
                  </h4>
                  <div className="mt-3 space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                    {group.variables.map((variable) => {
                      const value =
                        cssVariables[variable.name] ??
                        DEFAULT_THEME_VARIABLES[variable.name] ??
                        '#000000';
                      const isSelected = selectedVariableName === variable.name;
                      return (
                        <button
                          key={variable.name}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                            isSelected
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                              : 'border-transparent hover:bg-white/50'
                          }`}
                          onClick={() => setSelectedVariableName(variable.name)}
                        >
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                              {variable.label}
                            </p>
                            {variable.description && (
                              <p className="text-xs text-[var(--color-text-secondary)]">
                                {variable.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className="h-8 w-8 rounded-full border border-[var(--color-border)]"
                              style={{ backgroundColor: value }}
                            />
                            <input
                              type="text"
                              className="w-28 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm uppercase text-[var(--color-text-primary)]"
                              value={value}
                              onChange={(event) => updateVariable(variable.name, event.target.value)}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {activeVariableDefinition?.label ?? 'Variable'}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {activeVariableDefinition?.description ?? 'Use the color picker to adjust the value.'}
              </p>
              <div className="mt-4">
                <HexColorPicker
                  color={activeVariableValue}
                  onChange={(value) => updateVariable(selectedVariableName, value)}
                />
              </div>
            </div>
          </div>
        );
      case 'review':
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] p-4">
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">Summary</h4>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-text-primary)]">Name:</span>{' '}
                {themeName || 'Untitled Theme'}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-text-primary)]">
                  Description:
                </span>{' '}
                {themeDescription || 'No description'}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-text-primary)]">
                  Variables:
                </span>{' '}
                {Object.keys(cssVariables).length} defined
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] p-4">
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Preview Palette
              </h4>
              <div className="mt-3 flex flex-wrap gap-3">
                {['--color-primary', '--color-background', '--color-surface', '--color-success'].map(
                  (variable) => (
                    <div key={variable} className="flex flex-col items-center gap-1 text-center">
                      <span
                        className="h-10 w-10 rounded-full border border-[var(--color-border)]"
                        style={{ backgroundColor: cssVariables[variable] ?? '#000000' }}
                      />
                      <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                        {variable.replace('--color-', '')}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl">
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
              Theme Editor
            </p>
            <h3 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {initialTheme ? 'Edit Theme' : 'Create New Theme'}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {steps[currentStep].description}
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Close ✕
          </button>
        </header>

        <div className="flex h-full flex-col">
          <div className="flex gap-2 border-b border-[var(--color-border)] px-6 py-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex flex-1 flex-col rounded-lg border px-3 py-2 text-xs font-semibold ${
                  index === currentStep
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-transparent bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]'
                }`}
              >
                Step {index + 1}
                <span className="text-sm">{step.title}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {error && (
              <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            {renderStepContent()}
          </div>

          <footer className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
            <button
              type="button"
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] disabled:opacity-60"
              onClick={goToPreviousStep}
              disabled={currentStep === 0 || isSubmitting}
            >
              Back
            </button>
            <div className="flex gap-3">
              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={goToNextStep}
                  disabled={isSubmitting}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving…' : initialTheme ? 'Update Theme' : 'Create Theme'}
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default ThemeEditor;
