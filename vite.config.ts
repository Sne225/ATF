import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Forward /api to the FastAPI backend during development.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
