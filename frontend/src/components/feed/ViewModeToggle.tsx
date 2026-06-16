import { useLocation, useNavigate } from 'react-router-dom';
import { useMultiColumnFeed } from '../../contexts/MultiColumnFeedContext';

export function ViewModeToggle() {
  const { state, setViewMode, setLastStandardPath } = useMultiColumnFeed();
  const navigate = useNavigate();
  const location = useLocation();

  const modes = [
    { value: 'standard', label: 'Standard', icon: '☰' },
    { value: 'omniscroll', label: 'Scroll', icon: '|||' },
  ] as const;

  const isSlimMode = state.viewMode === 'omniscroll' || state.viewMode === 'standard-scroll';

  return (
    <div className="view-mode-toggle flex items-center gap-1 bg-[var(--color-surface)] rounded-md p-1 border border-[var(--color-border)]">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => {
            setViewMode(mode.value);
            if (mode.value === 'omniscroll' && location.pathname !== '/') {
              setLastStandardPath(`${location.pathname}${location.search}${location.hash}`);
              navigate('/');
              return;
            }
            if (
              mode.value === 'standard' &&
              state.viewMode !== 'standard' &&
              state.lastStandardPath &&
              location.pathname === '/'
            ) {
              navigate(state.lastStandardPath);
            }
          }}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            state.viewMode === mode.value
              ? 'bg-cyan-500 text-black font-semibold'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)]'
          }`}
          title={mode.label}
        >
          <span className="font-mono text-sm">{mode.icon}</span>
          {!isSlimMode && <span className="ml-1 hidden sm:inline">{mode.label}</span>}
        </button>
      ))}
    </div>
  );
}
