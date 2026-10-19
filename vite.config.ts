/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.ELECTRON_BUILD === 'true' ? './' : '/',
  server: {
    port: 5173,
    open: process.env.ELECTRON_DEV !== 'true',
  },
  test: {
    // 既定は Node 環境（純粋関数用・高速）。DOM を要するテストは
    // ファイル先頭の `// @vitest-environment jsdom` で個別に切り替える。
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'electron/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/views/**', 'src/models/**'],
      reporter: ['text', 'html'],
    },
  },
})
