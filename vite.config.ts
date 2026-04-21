import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api/gamma': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/gamma/, ''),
      },
      '/api/data': {
        target: 'https://data-api.polymarket.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/data/, ''),
      },
      '/api/clob': {
        target: 'https://clob.polymarket.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/clob/, ''),
      },
    },
  },
})
