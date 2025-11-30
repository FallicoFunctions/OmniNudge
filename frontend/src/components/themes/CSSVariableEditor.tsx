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
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {variable.description}
                      </p>
                    )}
                    {errorMessage && (
                      <p className="text-xs text-red-500">{errorMessage}</p>
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
                      onChange={(event) => onChangeVariable(variable.name, event.target.value)}
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
