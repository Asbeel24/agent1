import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sites } from './build/sites-vite-plugin'

// Main 部署到 Cloudflare Workers 时设 ENABLE_CLOUDFLARE=1，让 wrangler 接管多环境构建。
// B-Version 走 Vercel/本地开发时不设 → dist 输出回落到 dist/ 单层结构。
const enableCloudflare = process.env.ENABLE_CLOUDFLARE === '1'

const plugins: PluginOption[] = [react(), sites()]
if (enableCloudflare) {
  plugins.push(
    cloudflare({
      viteEnvironment: { name: 'server' },
    }),
  )
}

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
  plugins,
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
