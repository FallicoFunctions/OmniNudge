import { useEffect, useState } from 'react';
import type { RuntimeSession } from '../lib/session';

const LOADOUT_FIELDS = {
  body: ['classic', 'athletic', 'cyber'],
  hair: ['buzz', 'braids', 'wave'],
  hair_color: ['black', 'platinum', 'neon_blue'],
  skin_tone: ['deep', 'olive', 'light'],
  top: ['black_mesh', 'silver_jacket', 'neon_hoodie'],
  bottom: ['cargo_black', 'vinyl_red', 'rave_shorts'],
  accessory: ['none', 'visor', 'glow_chain'],
  dance: ['idle', 'two_step', 'laser_hands'],
} as const;

type RuntimeLoadout = Record<string, string>;

export function LoadoutPanel(props: {
  session: RuntimeSession;
  onSaveLoadout: (loadout: RuntimeLoadout) => Promise<void> | void;
  isSaving: boolean;
}) {
  const { session, onSaveLoadout, isSaving } = props;
  const [draft, setDraft] = useState<RuntimeLoadout>(mergeLoadout(session.loadout));
  const [status, setStatus] = useState('');

  useEffect(() => {
    setDraft(mergeLoadout(session.loadout));
  }, [session.loadout]);

  const saveLabel = session.mode === 'guest' ? 'Apply for this session' : 'Save to OmniNudge';
  const helper =
    session.mode === 'guest'
      ? 'Guest loadout is temporary but fully editable for the current session.'
      : 'Signed-in loadout persists through OmniNudge.';

  const handleSave = async () => {
    setStatus('');
    await onSaveLoadout(draft);
    setStatus(session.mode === 'guest' ? 'Applied for this guest session.' : 'Saved to your OmniNudge profile.');
  };

  return (
    <section className="side-panel">
      <h2>Loadout</h2>
      <p>{helper}</p>
      <div className="loadout-grid">
        {Object.entries(LOADOUT_FIELDS).map(([field, options]) => (
          <label key={field} className="loadout-field">
            <span>{formatFieldLabel(field)}</span>
            <select
              value={draft[field] ?? options[0]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button type="button" className="loadout-save-button" onClick={() => void handleSave()} disabled={isSaving}>
        {isSaving ? 'Saving…' : saveLabel}
      </button>
      {status ? <p className="loadout-status">{status}</p> : null}
    </section>
  );
}

function mergeLoadout(loadout?: RuntimeLoadout): RuntimeLoadout {
  return {
    body: 'classic',
    hair: 'buzz',
    hair_color: 'black',
    skin_tone: 'olive',
    top: 'black_mesh',
    bottom: 'cargo_black',
    accessory: 'none',
    dance: 'idle',
    ...loadout,
  };
}

function formatFieldLabel(field: string) {
  return field
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
