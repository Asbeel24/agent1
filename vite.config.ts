import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sites } from './build/sites-vite-plugin'

export default defineConfig({
  server: {
    proxy: {
      '/opentars-api': {
        target: 'https://agent1-dev-api.bicamind.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/opentars-api/, ''),
      },
    },
  },
  plugins: [
    react(),
    sites(),
    cloudflare({
      viteEnvironment: { name: 'server' },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
