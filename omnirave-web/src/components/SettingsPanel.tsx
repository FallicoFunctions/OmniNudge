import type {
  CameraFollowMode,
  CrouchMode,
  GraphicsMode,
  RuntimeSettings,
  UiThemeName,
} from '../lib/settings';

const THEME_OPTIONS: UiThemeName[] = ['Obsidian Glass', 'Luminous Panels', 'Hybrid Premium'];
const GRAPHICS_MODES: GraphicsMode[] = ['auto', 'manual'];
const CAMERA_OPTIONS: CameraFollowMode[] = ['auto-follow', 'free'];
const CROUCH_OPTIONS: CrouchMode[] = ['hold', 'toggle'];

export function SettingsPanel(props: {
  settings: RuntimeSettings;
  onSettingsChange: (settings: RuntimeSettings) => void;
  onRespawn: () => void;
}) {
  const { settings, onSettingsChange, onRespawn } = props;

  return (
    <section className="settings-panel" aria-label="Runtime settings">
      <div className="settings-panel-header">
        <div>
          <p className="settings-panel-kicker">Settings</p>
          <h2>Traversal runtime</h2>
        </div>
        <button type="button" className="hud-button hud-button-accent" onClick={onRespawn}>
          Respawn
        </button>
      </div>

      <dl className="settings-panel-grid">
        <div>
          <dt>
            <label htmlFor="runtime-theme-select">Theme</label>
          </dt>
          <dd>
            <select
              id="runtime-theme-select"
              value={settings.uiTheme}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  uiTheme: event.target.value as UiThemeName,
                })
              }
            >
              {THEME_OPTIONS.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          </dd>
        </div>

        <div>
          <dt>
            <label htmlFor="runtime-graphics-mode-select">Graphics mode</label>
          </dt>
          <dd>
            <select
              id="runtime-graphics-mode-select"
              value={settings.graphicsMode}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  graphicsMode: event.target.value as GraphicsMode,
                })
              }
            >
              {GRAPHICS_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </dd>
        </div>

        <div>
          <dt>
            <label htmlFor="runtime-graphics-level-range">Graphics level</label>
          </dt>
          <dd>
            <input
              id="runtime-graphics-level-range"
              type="range"
              min={1}
              max={10}
              value={settings.graphicsLevel}
              disabled={settings.graphicsMode === 'auto'}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  graphicsMode: 'manual',
                  graphicsLevel: Number(event.target.value),
                })
              }
            />
            <span>{settings.graphicsLevel}</span>
          </dd>
        </div>

        <div>
          <dt>
            <label htmlFor="runtime-display-names-toggle">Display names</label>
          </dt>
          <dd>
            <input
              id="runtime-display-names-toggle"
              type="checkbox"
              checked={settings.displayNames}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  displayNames: event.target.checked,
                })
              }
            />
          </dd>
        </div>

        <div>
          <dt>
            <label htmlFor="runtime-camera-follow-select">Camera</label>
          </dt>
          <dd>
            <select
              id="runtime-camera-follow-select"
              value={settings.cameraFollow}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  cameraFollow: event.target.value as CameraFollowMode,
                })
              }
            >
              {CAMERA_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </dd>
        </div>

        <div>
          <dt>
            <label htmlFor="runtime-crouch-mode-select">Crouch</label>
          </dt>
          <dd>
            <select
              id="runtime-crouch-mode-select"
              value={settings.crouchMode}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  crouchMode: event.target.value as CrouchMode,
                })
              }
            >
              {CROUCH_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </dd>
        </div>

        <div>
          <dt>Chat panel</dt>
          <dd>{settings.chatCollapsed ? 'Collapsed' : 'Expanded'}</dd>
        </div>
      </dl>

      <p className="settings-panel-note">
        Runtime settings apply immediately. Respawn returns you to the current venue spawn and clears transient chat state.
      </p>
    </section>
  );
}
