import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface OnboardingStep {
  titleKey: string;
  descriptionKey: string;
  illustration: string;
  tipKey?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    titleKey: 'themes.onboarding.steps.welcome.title',
    descriptionKey: 'themes.onboarding.steps.welcome.description',
    illustration: '🎨',
    tipKey: 'themes.onboarding.steps.welcome.tip',
  },
  {
    titleKey: 'themes.onboarding.steps.predefined.title',
    descriptionKey: 'themes.onboarding.steps.predefined.description',
    illustration: '🌈',
    tipKey: 'themes.onboarding.steps.predefined.tip',
  },
  {
    titleKey: 'themes.onboarding.steps.custom.title',
    descriptionKey: 'themes.onboarding.steps.custom.description',
    illustration: '✨',
    tipKey: 'themes.onboarding.steps.custom.tip',
  },
  {
    titleKey: 'themes.onboarding.steps.complete.title',
    descriptionKey: 'themes.onboarding.steps.complete.description',
    illustration: '🚀',
  },
];

const STORAGE_KEY = 'omninudge_theme_onboarding_completed';

interface ThemeOnboardingProps {
  onComplete?: () => void;
}

const ThemeOnboarding = ({ onComplete }: ThemeOnboardingProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const { t } = useTranslation();

  useEffect(() => {
    // Check if user has completed onboarding
    const hasCompleted = localStorage.getItem(STORAGE_KEY);
    if (!hasCompleted) {
      // Show onboarding after a brief delay
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsOpen(false);
    if (onComplete) {
      onComplete();
    }
  };

  if (!isOpen) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const title = t(step.titleKey);
  const description = t(step.descriptionKey);
  const tip = step.tipKey ? t(step.tipKey) : undefined;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-2xl animate-scale-in">
        {/* Progress indicators */}
        <div className="mb-6 flex justify-center gap-2">
          {ONBOARDING_STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-2 w-8 rounded-full transition-all ${
                index === currentStep
                  ? 'bg-[var(--color-primary)] w-12'
                  : index < currentStep
                    ? 'bg-[var(--color-primary)] opacity-50'
                    : 'bg-[var(--color-border)]'
              }`}
            />
          ))}
        </div>

        {/* Illustration */}
        <div className="mb-6 text-center text-7xl">{step.illustration}</div>

        {/* Content */}
        <div className="text-center">
          <h2 id="onboarding-title" className="text-2xl font-bold text-[var(--color-text-primary)]">
            {title}
          </h2>
          <p className="mt-3 text-base text-[var(--color-text-secondary)]">{description}</p>

          {tip && (
            <div className="mt-4 rounded-lg bg-[var(--color-primary)] bg-opacity-10 px-4 py-3">
              <p className="text-sm font-medium text-[var(--color-primary)]">
                💡 {t('themes.onboarding.tipLabel')}: {tip}
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
            onClick={handleSkip}
          >
            {isLastStep ? '' : t('themes.onboarding.actions.skip')}
          </button>

          <div className="flex gap-3">
            {!isFirstStep && (
              <button
                type="button"
                className="rounded-lg border border-[var(--color-border)] px-6 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition"
                onClick={handlePrevious}
              >
                {t('common.back')}
              </button>
            )}
            <button
              type="button"
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
              onClick={handleNext}
            >
              {isLastStep ? t('themes.onboarding.actions.letsGo') : t('common.next')}
            </button>
          </div>
        </div>

        {/* Step counter */}
        <p className="mt-4 text-center text-xs text-[var(--color-text-muted)]">
          {t('themes.onboarding.stepCounter', {
            current: currentStep + 1,
            total: ONBOARDING_STEPS.length,
          })}
        </p>
      </div>
    </div>,
    document.body
  );
};

// Utility function to reset onboarding (for testing)
export const resetThemeOnboarding = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export default ThemeOnboarding;
