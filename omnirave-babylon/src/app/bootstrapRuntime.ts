import { createRuntimeErrorOverlay } from '../ui/createRuntimeErrorOverlay';

export async function bootstrapRuntime() {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('Missing #app host');
  }

  let host = app.querySelector<HTMLElement>('[data-testid="babylon-runtime-host"]');
  if (!host) {
    host = document.createElement('div');
    host.dataset.testid = 'babylon-runtime-host';
    host.className = 'babylon-runtime-host';
    app.appendChild(host);
  }

  if (!host.querySelector('canvas[data-testid="babylon-render-canvas"]')) {
    host.replaceChildren();
    try {
      const { createRuntime } = await import('./createRuntime');
      await createRuntime(host);
    } catch (error) {
      host.replaceChildren();
      createRuntimeErrorOverlay(host, () => {
        void bootstrapRuntime().catch((retryError) => {
          console.error('Main Stage retry failed', retryError);
        });
      });
      throw error;
    }
  }
}
