import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

function getBuildId() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(getBuildId()),
  },
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router'],
  },
  server: {
    port: 5176,
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // hls.js is an intentionally isolated, lazy-loaded playback runtime. Its
    // current minified chunk is ~522 kB (~161 kB gzip), so keep the warning
    // threshold just above that known boundary while preserving alerts for
    // unexpected growth elsewhere.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-router/')) {
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
