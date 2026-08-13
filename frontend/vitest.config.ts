import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup/test-setup.ts',
    globals: true,
    css: false,
    // Four jsdom workers intermittently starve query-driven page tests on
    // developer and CI machines. Two keeps the complete suite deterministic.
    maxWorkers: 2,
    minWorkers: 1,
    testTimeout: 20000,
    slowTestThreshold: 5000,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', 'tests/**/*.spec.ts'],
  },
});
