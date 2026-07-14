import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useFormat } from '../../hooks/useFormat';
import { themeService } from '../../services/themeService';
import type { UserTheme } from '../../types/theme';
import {
  DEFAULT_THEME_VARIABLES,
  THEME_VARIABLE_GROUPS,
  getVariableDefinition,
} from '../../data/themeVariables';
import CSSVariableEditor from './CSSVariableEditor';
import ThemePreview from './ThemePreview';
import { cssVariablesSchema, themeInfoSchema } from '../../validation/themeSchemas';
import { isValidHexColor, looksLikeHexColor, normalizeHexColor } from '../../utils/color';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getContrastRatio } from '../../utils/contrast';

const ColorPicker = lazy(async () => {
  const module = await import('react-colorful');
  return { default: module.HexColorPicker };
});

const STEP_DEFS = [
  {
    id: 'base',
    titleKey: 'themes.editor.steps.base.title',
    descriptionKey: 'themes.editor.steps.base.description',
  },
  {
    id: 'info',
    titleKey: 'themes.editor.steps.info.title',
    descriptionKey: 'themes.editor.steps.info.description',
  },
  {
    id: 'variables',
    titleKey: 'themes.editor.steps.variables.title',
    descriptionKey: 'themes.editor.steps.variables.description',
  },
  {
    id: 'review',
    titleKey: 'themes.editor.steps.review.title',
    descriptionKey: 'themes.editor.steps.review.description',
  },
];

const SIZE_VALUE_REGEX = /^-?\d+(\.\d+)?(px|rem|em|%)$/i;
const MAX_STRING_LENGTH = 200;

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
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const { predefinedThemes, customThemes, refreshThemes, selectTheme } = useTheme();

  const steps = useMemo(
    () =>
      STEP_DEFS.map((step) => ({
        id: step.id,
        title: t(step.titleKey),
        description: t(step.descriptionKey),
      })),
    [t]
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedBaseThemeId, setSelectedBaseThemeId] = useState<number | null>(null);
  const [startFromScratch, setStartFromScratch] = useState(false);
  const [themeName, setThemeName] = useState('');
  const [themeDescription, setThemeDescription] = useState('');
  const [cssVariables, setCssVariables] = useState<Record<string, string>>(cloneVariables());
  const debouncedCssVariables = useDebouncedValue(cssVariables, 200);
  const [selectedVariableName, setSelectedVariableName] = useState(
    THEME_VARIABLE_GROUPS[0]?.variables[0]?.name ?? '--color-primary'
  );
  const [setAsActive, setSetAsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success'; text: string } | null>(
    null
  );
  const [infoErrors, setInfoErrors] = useState<{ name?: string; description?: string }>({});
  const [variableErrors, setVariableErrors] = useState<Record<string, string>>({});
  const cssVariableHistory = useRef<Record<string, string>[]>([]);
  const autoCloseTimeoutId = useRef<number | null>(null);
  const colorPickerLabelId = useMemo(
    () => `color-picker-label-${selectedVariableName.replace(/[^a-z0-9]/gi, '')}`,
    [selectedVariableName]
  );
  const contrastWarnings = useMemo(() => {
    const background =
      cssVariables['--color-background'] ?? DEFAULT_THEME_VARIABLES['--color-background'];
    const surface = cssVariables['--color-surface'] ?? DEFAULT_THEME_VARIABLES['--color-surface'];
    const textPrimary =
      cssVariables['--color-text-primary'] ?? DEFAULT_THEME_VARIABLES['--color-text-primary'];
    const textSecondary =
      cssVariables['--color-text-secondary'] ?? DEFAULT_THEME_VARIABLES['--color-text-secondary'];
    const combos = [
      {
        label: t('themes.editor.review.contrast.labels.primaryTextOnBackground'),
        fg: textPrimary,
        bg: background,
      },
      {
        label: t('themes.editor.review.contrast.labels.secondaryTextOnSurface'),
        fg: textSecondary,
        bg: surface,
      },
      {
        label: t('themes.editor.review.contrast.labels.primaryTextOnSurface'),
        fg: textPrimary,
        bg: surface,
      },
    ];
    return combos
      .map((combo) => {
        const ratio = getContrastRatio(combo.fg, combo.bg);
        return ratio !== null && ratio < 4.5 ? { ...combo, ratio: Number(ratio.toFixed(2)) } : null;
      })
      .filter(Boolean) as { label: string; ratio: number }[];
  }, [cssVariables, t]);

  const availableThemes = useMemo(
    () => [...predefinedThemes, ...customThemes],
    [predefinedThemes, customThemes]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (initialTheme) {
      setSelectedBaseThemeId(initialTheme.id);
      setStartFromScratch(false);
      setThemeName(initialTheme.theme_name);
      setThemeDescription(initialTheme.theme_description ?? '');
      setCssVariables(cloneVariables(initialTheme.css_variables));
      setSetAsActive(false);
    } else {
      const firstTheme = predefinedThemes[0] ?? availableThemes[0] ?? null;
      setSelectedBaseThemeId(firstTheme?.id ?? null);
      setStartFromScratch(!firstTheme);
      setThemeName('');
      setThemeDescription('');
      setCssVariables(cloneVariables(firstTheme?.css_variables));
      setSetAsActive(true);
    }
    cssVariableHistory.current = [];
    setCurrentStep(0);
    setError(null);
    setInfoErrors({});
    setVariableErrors({});
    setStatusMessage(null);
  }, [initialTheme, isOpen, predefinedThemes, availableThemes]);

  useEffect(() => {
    return () => {
      if (autoCloseTimeoutId.current) {
        window.clearTimeout(autoCloseTimeoutId.current);
        autoCloseTimeoutId.current = null;
      }
    };
  }, []);

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
    setStartFromScratch(false);
    setSelectedBaseThemeId(themeId);
    const baseTheme = availableThemes.find((theme) => theme.id === themeId);
    setCssVariables(cloneVariables(baseTheme?.css_variables));
    cssVariableHistory.current = [];
  };

  const handleStartFromScratch = () => {
    if (initialTheme) return;
    setStartFromScratch(true);
    setSelectedBaseThemeId(null);
    setCssVariables(cloneVariables({}));
    cssVariableHistory.current = [];
  };

  const setVariableError = useCallback((variableName: string, message?: string) => {
    setVariableErrors((prev) => {
      if (!message) {
        const next = { ...prev };
        delete next[variableName];
        return next;
      }
      return { ...prev, [variableName]: message };
    });
  }, []);

  const validateVariableValue = useCallback(
    (variableName: string, value: string) => {
      const trimmed = value.trim();
      const definition = getVariableDefinition(variableName);
      const type = definition?.type ?? 'string';

      if (!trimmed) {
        setVariableError(variableName, t('themes.editor.validation.valueRequired'));
        return false;
      }

      if (type === 'color') {
        const normalized = normalizeHexColor(trimmed);
        if (!looksLikeHexColor(trimmed)) {
          setVariableError(variableName, t('themes.editor.validation.hexExample'));
          return false;
        }
        if (!isValidHexColor(normalized)) {
          setVariableError(variableName, t('themes.editor.validation.hexLength'));
          return false;
        }
        setVariableError(variableName, undefined);
        return true;
      }

      if (type === 'size') {
        if (!SIZE_VALUE_REGEX.test(trimmed)) {
          setVariableError(variableName, t('themes.editor.validation.sizeUnits'));
          return false;
        }
        setVariableError(variableName, undefined);
        return true;
      }

      if (type === 'number') {
        const numeric = Number(trimmed);
        if (Number.isNaN(numeric)) {
          setVariableError(variableName, t('themes.editor.validation.numberRequired'));
          return false;
        }
        setVariableError(variableName, undefined);
        return true;
      }

      if (trimmed.length > MAX_STRING_LENGTH) {
        setVariableError(
          variableName,
          t('themes.editor.validation.maxLength', { max: MAX_STRING_LENGTH })
        );
        return false;
      }

      setVariableError(variableName, undefined);
      return true;
    },
    [setVariableError, t]
  );

  const updateVariable = (variableName: string, value: string) => {
    cssVariableHistory.current = [...cssVariableHistory.current.slice(-24), { ...cssVariables }];
    setCssVariables((prev) => ({
      ...prev,
      [variableName]: value,
    }));
    validateVariableValue(variableName, value);
  };

  const sanitizeVariableValueForSave = (variableName: string, value: string) => {
    const definition = getVariableDefinition(variableName);
    if (definition?.type === 'color') {
      return normalizeHexColor(value);
    }
    const trimmed = value.trim();
    if (definition?.type === 'size') {
      const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(px|rem|em|%)$/i);
      if (match) {
        return `${Number.parseFloat(match[1]).toString()}${match[2].toLowerCase()}`;
      }
    }
    return trimmed;
  };

  const handleUndo = useCallback(() => {
    const previous = cssVariableHistory.current.pop();
    if (previous) {
      setCssVariables(previous);
    }
  }, []);

  const validateInfoDetails = useCallback(() => {
    const result = themeInfoSchema.safeParse({
      theme_name: themeName,
      theme_description: themeDescription,
    });

    if (!result.success) {
      const issues: { name?: string; description?: string } = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (field === 'theme_name') {
          issues.name = issue.message;
        }
        if (field === 'theme_description') {
          issues.description = issue.message;
        }
      });
      setInfoErrors(issues);
      setError(t('themes.editor.validation.fixHighlighted'));
      return false;
    }

    setInfoErrors({});
    setError(null);
    return true;
  }, [themeDescription, themeName, setError, setInfoErrors, t]);

  const validateVariableSet = useCallback((): Record<string, string> | null => {
    const result = cssVariablesSchema.safeParse(cssVariables);
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      let generalMessage: string | null = null;
      result.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === 'string') {
          nextErrors[key] = issue.message;
        } else {
          generalMessage = issue.message;
        }
      });
      setVariableErrors(nextErrors);
      setError(generalMessage ?? t('themes.editor.validation.fixInvalidValues'));
      return null;
    }

    let isValid = true;
    const sanitizedEntries: Record<string, string> = {};

    Object.entries(result.data).forEach(([name, value]) => {
      const valid = validateVariableValue(name, value);
      if (!valid) {
        isValid = false;
      }
      sanitizedEntries[name] = sanitizeVariableValueForSave(name, value);
    });

    if (!isValid) {
      return null;
    }

    setVariableErrors({});
    setCssVariables(sanitizedEntries);
    setError(null);
    return sanitizedEntries;
  }, [cssVariables, setCssVariables, setError, setVariableErrors, t, validateVariableValue]);

  const validateStep = () => {
    const stepId = steps[currentStep].id;
    if (stepId === 'base' && !startFromScratch && !selectedBaseThemeId) {
      setError(t('themes.editor.validation.chooseBaseTheme'));
      return false;
    }

    if (stepId === 'info') {
      return validateInfoDetails();
    }

    if (stepId === 'variables') {
      return Boolean(validateVariableSet());
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

  const handleSubmit = useCallback(async () => {
    if (!validateInfoDetails()) {
      setCurrentStep(1);
      return;
    }

    const sanitizedVariables = validateVariableSet();
    if (!sanitizedVariables) {
      setCurrentStep(2);
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
          css_variables: sanitizedVariables,
        });
      } else {
        result = await themeService.createTheme({
          theme_name: themeName.trim(),
          theme_description: themeDescription.trim(),
          theme_type: 'variable_customization',
          scope_type: 'global',
          css_variables: sanitizedVariables,
          is_public: false,
        });
      }

      await refreshThemes();
      if (setAsActive) {
        await selectTheme(result);
      }
      // MISC-2: Success feedback visible for at least 2 seconds before auto-close
      setStatusMessage({
        type: 'success',
        text: initialTheme ? t('themes.editor.status.updated') : t('themes.editor.status.created'),
      });
      if (autoCloseTimeoutId.current) {
        window.clearTimeout(autoCloseTimeoutId.current);
      }
      autoCloseTimeoutId.current = window.setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 2000);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : t('themes.editor.errors.saveFailed');
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    initialTheme,
    refreshThemes,
    selectTheme,
    setAsActive,
    themeDescription,
    themeName,
    t,
    validateInfoDetails,
    validateVariableSet,
    onClose,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey;
      if (isModifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSubmit();
      } else if (isModifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        handleUndo();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSubmit, handleUndo, isOpen, onClose]);

  const renderStepContent = () => {
    const step = steps[currentStep];
    switch (step.id) {
      case 'base':
        return (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('themes.editor.base.intro')}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {!initialTheme && (
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left transition ${
                    startFromScratch
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/60'
                  }`}
                  onClick={handleStartFromScratch}
                >
                  <p className="text-base font-semibold text-[var(--color-text-primary)]">
                    {t('themes.editor.base.startFromScratch.title')}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {t('themes.editor.base.startFromScratch.description')}
                  </p>
                </button>
              )}
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
                {t('themes.editor.info.nameLabel')}
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                value={themeName}
                onChange={(event) => {
                  setThemeName(event.target.value);
                  if (infoErrors.name) {
                    setInfoErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                maxLength={100}
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {t('themes.editor.info.nameHelper')}
              </p>
              {infoErrors.name && <p className="text-xs text-red-500">{infoErrors.name}</p>}
            </div>
            <div>
              <label className="text-sm font-semibold text-[var(--color-text-primary)]">
                {t('themes.editor.info.descriptionLabel')}
              </label>
              <textarea
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                rows={3}
                value={themeDescription}
                onChange={(event) => {
                  setThemeDescription(event.target.value);
                  if (infoErrors.description) {
                    setInfoErrors((prev) => ({ ...prev, description: undefined }));
                  }
                }}
              />
              {infoErrors.description && (
                <p className="text-xs text-red-500">{infoErrors.description}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input
                type="checkbox"
                checked={setAsActive}
                onChange={(event) => setSetAsActive(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              {t('themes.editor.info.setActiveAfterSave')}
            </label>
          </div>
        );
      case 'variables':
        return (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <CSSVariableEditor
              groups={THEME_VARIABLE_GROUPS}
              variables={cssVariables}
              selectedVariable={selectedVariableName}
              variableErrors={variableErrors}
              onSelectVariable={setSelectedVariableName}
              onChangeVariable={updateVariable}
            />
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <p
                  id={colorPickerLabelId}
                  className="text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {activeVariableDefinition?.label ?? t('themes.editor.variables.variableFallback')}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {activeVariableDefinition?.description ??
                    t('themes.editor.variables.descriptionFallback')}
                </p>
                <div className="mt-4">
                  <Suspense
                    fallback={
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        {t('themes.editor.variables.loadingColorPicker')}
                      </div>
                    }
                  >
                    <ColorPicker
                      aria-label={t('themes.editor.variables.colorPickerAria', {
                        variable:
                          activeVariableDefinition?.label ??
                          t('themes.editor.variables.variableFallback'),
                      })}
                      aria-describedby={colorPickerLabelId}
                      color={activeVariableValue}
                      onChange={(value) => updateVariable(selectedVariableName, value)}
                    />
                  </Suspense>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <ThemePreview variables={debouncedCssVariables} />
              </div>
            </div>
          </div>
        );
      case 'review':
        return (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--color-border)] p-4">
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('themes.editor.review.summaryTitle')}
                </h4>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {t('themes.editor.review.labels.name')}
                  </span>{' '}
                  {themeName || t('themes.editor.review.fallbacks.untitledTheme')}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {t('themes.editor.review.labels.description')}
                  </span>{' '}
                  {themeDescription || t('themes.editor.review.fallbacks.noDescription')}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {t('themes.editor.review.labels.variables')}
                  </span>{' '}
                  {t('themes.editor.review.variablesDefined', {
                    formattedCount: formatNumber(Object.keys(cssVariables).length),
                  })}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] p-4">
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('themes.editor.review.previewPaletteTitle')}
                </h4>
                <div className="mt-3 flex flex-wrap gap-3">
                  {[
                    '--color-primary',
                    '--color-background',
                    '--color-surface',
                    '--color-success',
                  ].map((variable) => (
                    <div key={variable} className="flex flex-col items-center gap-1 text-center">
                      <span
                        className="h-10 w-10 rounded-full border border-[var(--color-border)]"
                        style={{ backgroundColor: cssVariables[variable] ?? '#000000' }}
                      />
                      <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                        {variable.replace('--color-', '')}
                      </span>
                    </div>
                  ))}
                </div>
                {contrastWarnings.length > 0 && (
                  <div className="mt-4 rounded-lg border border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-800">
                    <p className="font-semibold">{t('themes.editor.review.contrast.title')}</p>
                    <ul className="mt-1 list-disc pl-4">
                      {contrastWarnings.map((warning) => (
                        <li key={warning.label}>
                          {t('themes.editor.review.contrast.warning', {
                            label: warning.label,
                            ratio: formatNumber(warning.ratio, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }),
                          })}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <ThemePreview variables={debouncedCssVariables} showControls={false} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl">
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
              {t('themes.editor.header.kicker')}
            </p>
            <h3 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {initialTheme
                ? t('themes.editor.header.editTitle')
                : t('themes.editor.header.createTitle')}
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
            {t('themes.editor.actions.close')} <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
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
                {t('themes.editor.steps.stepLabel', { number: index + 1 })}
                <span className="text-sm">{step.title}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {statusMessage && (
              <p
                className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
                role="status"
                aria-live="polite"
              >
                {statusMessage.text}
              </p>
            )}
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
              {t('themes.editor.actions.back')}
            </button>
            <div className="flex gap-3">
              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={goToNextStep}
                  disabled={isSubmitting}
                >
                  {t('themes.editor.actions.next')}
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? t('themes.editor.actions.saving')
                    : initialTheme
                      ? t('themes.editor.actions.updateTheme')
                      : t('themes.editor.actions.createTheme')}
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
