export function TopLeftControls(props: {
  openPanel: 'settings' | 'avatar' | null;
  onToggleSettings: () => void;
  onAvatarClick: () => void;
}) {
  return (
    <div className="top-left-controls">
      <button
        type="button"
        className="hud-button"
        aria-pressed={props.openPanel === 'settings'}
        onClick={props.onToggleSettings}
      >
        Settings
      </button>
      <button
        type="button"
        className="hud-button"
        aria-pressed={props.openPanel === 'avatar'}
        onClick={props.onAvatarClick}
      >
        Avatar
      </button>
    </div>
  );
}
