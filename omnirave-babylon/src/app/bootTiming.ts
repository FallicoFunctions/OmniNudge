// Start-up timing for real players' browsers. Each phase records the time in
// milliseconds since the page's navigation began; one "omnirave_boot" event
// goes to the site's analytics once the world is visible and audible, on page
// exit, or after a minute. The browser is identified by the request's user
// agent, so a slow start in one browser can be read back from the database.
const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';
const REPORT_DEADLINE_MS = 60_000;

const phases: Record<string, number | string> = {};
let reported = false;

export function markBootPhase(phase: string, detail?: string): void {
  if (reported || phase in phases) return;
  phases[phase] = Math.round(performance.now());
  if (typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('bootProfile') === '1') {
    console.info(`[boot] ${phase} ${phases[phase]}${detail ? ` ${detail}` : ''}`);
  }
  // Also a standard mark, so a browser's performance tools show the phases.
  try {
    performance.mark(`omnirave:${phase}`);
  } catch {
    // Diagnostic only.
  }
  if (detail !== undefined) phases[`${phase}_detail`] = detail;
  if ('visible' in phases && 'audible' in phases) reportBootTiming();
}

export function reportBootTiming(): void {
  if (reported) return;
  reported = true;
  try {
    void fetch(`${OMNIGAME_API_URL}/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'omnirave_boot', properties: { ...phases, ...largeDownloads(), reported_at: Math.round(performance.now()) } }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Timing is diagnostic; it never affects the game.
  }
}

// Start and end of each model download (models are the large files), so a
// slow start can be split into network time and processing time.
function largeDownloads(): Record<string, string> {
  const downloads: Record<string, string> = {};
  for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    const file = entry.name.split('?')[0].split('/').pop() ?? '';
    if (!/\.glb(\.gz)?$/.test(file) || Object.keys(downloads).length >= 12) continue;
    downloads[`dl_${file}`] = `${Math.round(entry.startTime)}-${Math.round(entry.responseEnd)}`;
  }
  return downloads;
}

// Browsers keep 250 resource timings by default, and the game loads more
// files than that, so the model downloads fell out of Safari's reports.
if (typeof performance !== 'undefined') {
  try {
    performance.setResourceTimingBufferSize(1000);
  } catch {
    // Diagnostic only.
  }
}

// A player whose audio never starts still reports the phases that did happen.
if (typeof window !== 'undefined') {
  window.setTimeout(reportBootTiming, REPORT_DEADLINE_MS);
  // A quick refresh otherwise discards the first load before its deadline.
  // The existing keepalive request finishes after navigation; the report
  // guard prevents another event if audio or the deadline already sent it.
  window.addEventListener('pagehide', reportBootTiming);
}
