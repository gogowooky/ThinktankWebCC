/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadDotenv } from 'dotenv'

// server/.env の API_SHARED_SECRET を dev プロキシ経由のリクエストに自動付与する。
// これによりブラウザ側コードはシークレットを一切知らなくてよい
// （未設定の場合は何も付与せず、サーバー側 apiAuth も無効のまま動作する）。
// テスト実行時（vitest）は server/.env（AI APIキー等）をテストプロセスに漏らさないため読み込まない。
if (!process.env.VITEST) {
  loadDotenv({ path: 'server/.env' })
}
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
  test: {
    // 既定は Node 環境（純粋関数用・高速）。DOM を要するテストは
    // ファイル先頭の `// @vitest-environment jsdom` で個別に切り替える。
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/views/**', 'src/models/**'],
      reporter: ['text', 'html'],
    },
  },
})
