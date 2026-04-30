import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Proxy de desarrollo del dashboard.
 *
 * /api/rrv:
 *   Conteo rápido RRV.
 *
 * /api/oficial:
 *   Cómputo oficial.
 *
 * Nota:
 * El frontend no depende de la ubicación interna del backend oficial.
 * Solo necesita que en desarrollo exista una API oficial escuchando en localhost:4000.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/rrv': {
        target: 'http://localhost:4001',
        changeOrigin: true
      },
      '/api/oficial': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
})