import type { ThemeCategory } from '../../types/theme';
import { DEFAULT_THEME_VARIABLES } from '../../data/themeVariables';

interface CSSVariableEditorProps {
  groups: ThemeCategory[];
  variables: Record<string, string>;
  selectedVariable: string;
  variableErrors?: Record<string, string>;
  onSelectVariable: (name: string) => void;
  onChangeVariable: (name: string, value: string) => void;
}

const CSSVariableEditor = ({
  groups,
  variables,
  selectedVariable,
  variableErrors = {},
  onSelectVariable,
  onChangeVariable,
}: CSSVariableEditorProps) => {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.id}>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {group.name}
          </h4>
          <div className="mt-3 space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
            {group.variables.map((variable) => {
              const value =
                variables[variable.name] ??
                DEFAULT_THEME_VARIABLES[variable.name] ??
                variable.value ??
                '#000000';
              const isSelected = selectedVariable === variable.name;
              const errorMessage = variableErrors[variable.name];
              const descriptionId = `${variable.name}-description`;
              const inputClasses = [
                'rounded-md border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none',
                variable.type === 'color' ? 'uppercase w-28' : '',
                variable.type === 'string' ? 'w-full max-w-xs' : '',
                variable.type === 'size' ? 'w-32' : '',
                variable.type === 'number' ? 'w-24' : '',
              ]
                .filter(Boolean)
                .join(' ') || 'rounded-md border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none';

              const placeholder =
                variable.type === 'color'
                  ? '#000000'
                  : variable.type === 'size'
                    ? variable.unit ?? '1rem'
                    : variable.type === 'number'
                      ? '1.0'
                      : variable.type === 'string'
                        ? 'Font stack'
                        : '';

              return (
                <button
                  key={variable.name}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                    isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                      : 'border-transparent hover:bg-white/50'
                  }`}
                  onClick={() => onSelectVariable(variable.name)}
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {variable.label}
                    </p>
                    {variable.description && (
                      <p id={descriptionId} className="text-xs text-[var(--color-text-secondary)]">
                        {variable.description}
                      </p>
                    )}
                    {errorMessage && (
                      <p className="text-xs text-red-500">{errorMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {variable.type === 'color' && (
                      <span
                        className="h-8 w-8 rounded-full border border-[var(--color-border)]"
                        style={{ backgroundColor: value }}
                      />
                    )}
                    <input
                      type={variable.type === 'number' ? 'number' : 'text'}
                      spellCheck={false}
                      className={inputClasses}
                      placeholder={placeholder}
                      value={value}
                      onChange={(event) => onChangeVariable(variable.name, event.target.value)}
                      title={variable.unit ? `Unit: ${variable.unit}` : undefined}
                      aria-describedby={variable.description ? descriptionId : undefined}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CSSVariableEditor;
