import type { RuntimeSettings, UiThemeName } from '../lib/settings';

const THEME_OPTIONS: UiThemeName[] = ['Obsidian Glass', 'Luminous Panels', 'Hybrid Premium'];

export function SettingsPanel(props: { settings: RuntimeSettings; onSettingsChange: (settings: RuntimeSettings) => void }) {
  const { settings, onSettingsChange } = props;

  return (
    <section className="settings-panel" aria-label="Runtime settings">
      <div className="settings-panel-header">
        <p className="settings-panel-kicker">Runtime Settings</p>
        <h2>Session foundation</h2>
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
          <dt>Graphics</dt>
          <dd>{settings.graphicsMode}</dd>
        </div>
        <div>
          <dt>Display names</dt>
          <dd>{settings.displayNames ? 'On' : 'Off'}</dd>
        </div>
        <div>
          <dt>Chat panel</dt>
          <dd>{settings.chatCollapsed ? 'Collapsed' : 'Expanded'}</dd>
        </div>
        <div>
          <dt>Crouch mode</dt>
          <dd>{settings.crouchMode}</dd>
        </div>
        <div>
          <dt>Camera</dt>
          <dd>{settings.cameraFollow}</dd>
        </div>
      </dl>
      <p className="settings-panel-note">Theme changes apply immediately. The rest of the settings surface stays intentionally minimal in this task.</p>
    </section>
  );
}
