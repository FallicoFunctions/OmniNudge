import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup/test-setup.ts',
    css: false,
  },
});
