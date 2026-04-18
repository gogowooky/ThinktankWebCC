import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Viteプラグイン: /view/* リクエストに自己完結型HTMLを返す
 *
 * ブラウザ側で IndexedDB からデータ取得 → markdown→HTML変換 → 表示。
 * アプリ内WebView (iframe) でも、別ブラウザタブでも同じURLで動作する。
 */
function viewPlugin(): Plugin {
  const templates: Record<string, string> = {}

  return {
    name: 'thinktank-view',
    configureServer(server) {
      // テンプレートHTMLを読み込み
      const templatesDir = resolve(__dirname, 'src/view-templates')
      templates.markdown = readFileSync(resolve(templatesDir, 'markdown.html'), 'utf-8')
      templates.chat = readFileSync(resolve(templatesDir, 'chat.html'), 'utf-8')

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/view/')) return next()

        const urlObj = new URL(req.url, 'http://localhost')
        const viewType = urlObj.pathname.replace('/view/', '')

        // 開発中はリクエストごとに再読み込み（テンプレート編集を即反映）
        if (viewType in templates) {
          try {
            templates[viewType] = readFileSync(resolve(templatesDir, `${viewType}.html`), 'utf-8')
          } catch { /* fallback to cached */ }
        }

        const template = templates[viewType]
        if (template) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(template)
          return
        }

        // 未対応の viewType
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain')
        res.end('Not found: ' + viewType)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), viewPlugin()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
