// Public files (models, audio, the Draco decoder) are served under the
// runtime's base path: "/" in development and tests, and the path the site
// mounts the game at in production (OMNIRAVE_BASE at build time, for example
// "/games/omnirave/play/"). A relative base ("./") resolves against the page,
// which breaks for a URL without a trailing slash, so it falls back to "/".
const configuredBase = import.meta.env.BASE_URL;
const base = configuredBase.startsWith('/') ? configuredBase : '/';

// publicUrl('/assets/x.glb') -> '/games/omnirave/play/assets/x.glb' in production.
export function publicUrl(path: string): string {
  return base + path.replace(/^\//, '');
}
