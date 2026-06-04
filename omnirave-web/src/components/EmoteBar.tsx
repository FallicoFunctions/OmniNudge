const EMOTE_SLOTS = ['Wave', 'Glow', 'Jump', 'Heart'];

export function EmoteBar() {
  return (
    <section className="emote-bar-shell" aria-label="Emote bar">
      <div className="emote-bar-slots">
        {EMOTE_SLOTS.map((label) => (
          <button key={label} type="button" className="emote-slot" disabled>
            {label}
          </button>
        ))}
      </div>
      <div className="emote-bar-status">
        <span>Stamina</span>
        <div className="emote-bar-meter" aria-hidden="true">
          <div className="emote-bar-meter-fill" />
        </div>
      </div>
    </section>
  );
}
