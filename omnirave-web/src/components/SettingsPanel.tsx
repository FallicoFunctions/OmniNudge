import type { RuntimeSettings } from '../lib/settings';

export function SettingsPanel(props: { settings: RuntimeSettings }) {
  const { settings } = props;

  return (
    <section className="settings-panel" aria-label="Runtime settings">
      <div className="settings-panel-header">
        <p className="settings-panel-kicker">Runtime Settings</p>
        <h2>Session foundation</h2>
      </div>
      <dl className="settings-panel-grid">
        <div>
          <dt>Theme</dt>
          <dd>{settings.uiTheme}</dd>
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
      <p className="settings-panel-note">Live settings controls land in the next task. This shell keeps the HUD anchors stable now.</p>
    </section>
  );
}
