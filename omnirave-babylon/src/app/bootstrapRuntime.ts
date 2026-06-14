export async function bootstrapRuntime() {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('Missing #app host');
  }

  let host = app.querySelector<HTMLElement>('[data-testid="babylon-runtime-host"]');
  const hostCreated = !host;
  if (!host) {
    host = document.createElement('div');
    host.dataset.testid = 'babylon-runtime-host';
    host.className = 'babylon-runtime-host';
    app.appendChild(host);
  }

  if (!host.querySelector('canvas[data-testid="babylon-render-canvas"]')) {
    try {
      const { createRuntime } = await import('./createRuntime');
      await createRuntime(host);
    } catch (error) {
      host.replaceChildren();
      if (hostCreated) {
        host.remove();
      }
      throw error;
    }
  }
}
