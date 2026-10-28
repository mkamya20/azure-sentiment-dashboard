import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The proxy is for local development. A Static Web Apps deployment serves /api
// on the same origin, so the browser does not use this proxy in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7071',
        changeOrigin: true,
      },
    },
  },
})
