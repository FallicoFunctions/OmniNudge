import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    port: 5176,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-router-dom/')) {
            return 'react-vendor';
          }

          if (id.includes('/node_modules/@tanstack/react-query/')) {
            return 'tanstack-query';
          }

          if (id.includes('/node_modules/diff/')) {
            return 'diff';
          }

          if (id.includes('/node_modules/react-colorful/')) {
            return 'react-colorful';
          }
        },
      },
    },
  },
})
