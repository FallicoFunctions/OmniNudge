export function bootstrapRuntime() {
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
}
