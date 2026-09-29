import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2300,
    rollupOptions: {
      // Isolated review stages ship next to the main runtime.
      input: {
        main: 'index.html',
        review: 'review.html',
        complete: 'complete-review.html',
        crowd: 'crowd-review.html',
        fireworks: 'fireworks-review.html',
        showControl: 'show-control-review.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    css: false,
    fileParallelism: false,
  },
});
