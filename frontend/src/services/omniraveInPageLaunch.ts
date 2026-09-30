// OmniRave starts inside this page instead of navigating to it. Safari only
// lets a page play sound that started during a click in that same page, so
// the Play click primes an audio element and an AudioContext, and the game,
// loaded into this document, takes both over for the stage track. Chrome and
// Firefox would carry the click across a navigation; Safari does not.

export interface PrimedGameAudio {
  element: HTMLAudioElement;
  context?: AudioContext;
}

declare global {
  interface Window {
    __omniravePrimedAudio?: PrimedGameAudio;
  }
}

// 50 ms of 8-bit mono silence: a real sound the browser will "play".
function silentWavUrl(): string {
  const samples = 400;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

/** Call synchronously inside the Play click, before any await. */
export function primeGameAudio(): PrimedGameAudio | undefined {
  try {
    const element = new Audio();
    element.src = silentWavUrl();
    void element.play()?.catch(() => {});
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const context = AudioContextCtor ? new AudioContextCtor() : undefined;
    void context?.resume()?.catch(() => {});
    return { element, context };
  } catch {
    return undefined;
  }
}

/**
 * Turns this page into the game: same document, so the click above still
 * counts. The address becomes the game's; Back reloads the page.
 */
export async function startGameInPage(launchUrl: string, primed: PrimedGameAudio | undefined) {
  const url = new URL(launchUrl, window.location.href);
  // A game on another origin (local development) cannot share this page.
  if (url.origin !== window.location.origin) {
    window.location.assign(url.toString());
    return;
  }
  const response = await fetch(new URL('./', url).toString(), { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Game page returned ${response.status}`);
  const gameDocument = new DOMParser().parseFromString(await response.text(), 'text/html');

  if (primed) window.__omniravePrimedAudio = primed;
  window.history.pushState(null, '', url.toString());
  window.addEventListener('popstate', () => window.location.reload(), { once: true });
  document.title = 'OmniRave';

  // The site's styles and app give way to the game's.
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => node.remove());
  const siteRoot = document.getElementById('root');
  if (siteRoot) {
    siteRoot.hidden = true;
    siteRoot.setAttribute('inert', '');
  }
  const app = document.createElement('div');
  app.id = 'app';
  document.body.appendChild(app);

  for (const source of gameDocument.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"], link[rel="modulepreload"]'
  )) {
    const link = document.createElement('link');
    link.rel = source.rel;
    link.href = new URL(source.getAttribute('href') ?? '', url).toString();
    link.crossOrigin = source.crossOrigin;
    document.head.appendChild(link);
  }
  for (const source of gameDocument.querySelectorAll<HTMLScriptElement>(
    'script[type="module"][src]'
  )) {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = new URL(source.getAttribute('src') ?? '', url).toString();
    script.crossOrigin = source.crossOrigin;
    document.head.appendChild(script);
  }
}
