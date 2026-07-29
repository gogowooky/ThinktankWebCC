import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadDotenv } from 'dotenv'

// server/.env の API_SHARED_SECRET を dev プロキシ経由のリクエストに自動付与する。
// これによりブラウザ側コードはシークレットを一切知らなくてよい
// （未設定の場合は何も付与せず、サーバー側 apiAuth も無効のまま動作する）。
loadDotenv({ path: 'server/.env' })
const apiSharedSecret = process.env.API_SHARED_SECRET

export default defineConfig({
  plugins: [react()],
  base: process.env.ELECTRON_BUILD === 'true' ? './' : '/',
  server: {
    port: 5173,
    open: process.env.ELECTRON_DEV !== 'true',
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          if (!apiSharedSecret) return
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('X-Thinktank-Api-Key', apiSharedSecret)
          })
        },
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
