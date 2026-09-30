// Start-up timing for real players' browsers. Each phase records the time in
// milliseconds since the page's navigation began; one "omnirave_boot" event
// goes to the site's analytics when the stage becomes audible, or after a
// minute if it never does. The browser is identified by the request's user
// agent, so a slow start in one browser can be read back from the database.
const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';
const REPORT_DEADLINE_MS = 60_000;

const phases: Record<string, number | string> = {};
let reported = false;

export function markBootPhase(phase: string, detail?: string): void {
  if (reported || phase in phases) return;
  phases[phase] = Math.round(performance.now());
  if (detail !== undefined) phases[`${phase}_detail`] = detail;
}

export function reportBootTiming(): void {
  if (reported) return;
  reported = true;
  try {
    void fetch(`${OMNIGAME_API_URL}/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'omnirave_boot', properties: { ...phases, reported_at: Math.round(performance.now()) } }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Timing is diagnostic; it never affects the game.
  }
}

// A player whose audio never starts still reports the phases that did happen.
if (typeof window !== 'undefined') {
  window.setTimeout(reportBootTiming, REPORT_DEADLINE_MS);
}
