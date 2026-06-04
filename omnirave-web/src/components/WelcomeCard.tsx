import { useEffect, useRef } from 'react';

export function WelcomeCard(props: {
  playerName: string;
  mode: 'login' | 'signup';
  onClose: () => void;
  onEditAvatar: () => void;
}) {
  const onCloseRef = useRef(props.onClose);

  useEffect(() => {
    onCloseRef.current = props.onClose;
  }, [props.onClose]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onCloseRef.current();
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <section className="settings-panel welcome-card-shell" aria-label="Welcome to OmniRave">
      <p className="settings-panel-kicker">Welcome</p>
      <h2>{props.mode === 'signup' ? `Account ready, ${props.playerName}` : `Back in the room, ${props.playerName}`}</h2>
      <p className="settings-panel-note">
        {props.mode === 'signup'
          ? 'Your guest run upgraded in place. The avatar shell is ready when you want to tune your look.'
          : 'Your account session is live. Avatar editing stays in the placeholder shell for now.'}
      </p>
      <div className="settings-panel-actions">
        <button type="button" className="hud-button hud-button-accent" onClick={props.onEditAvatar}>
          Edit Avatar
        </button>
        <button type="button" className="hud-button" onClick={props.onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
