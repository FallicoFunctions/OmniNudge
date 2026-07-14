import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup/test-setup.ts',
    globals: true,
    css: false,
    maxWorkers: 4,
    minWorkers: 1,
    testTimeout: 20000,
    slowTestThreshold: 5000,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
