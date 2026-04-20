import { defineConfig, Plugin, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// APIミドルウェアプラグイン
function apiMiddlewarePlugin(): Plugin {
  return {
    name: 'api-middleware',
    configureServer(server: ViteDevServer) {
      // ミドルウェアを最初に追加
      server.middlewares.use((req, res, next) => {
        // /api/save
        if (req.method === 'POST' && req.url === '/api/save') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const { filename, content } = JSON.parse(body);
              const filePath = path.join(cacheDir, filename);
              // ファイルパスの親ディレクトリを再帰的に作成
              const dir = path.dirname(filePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              fs.writeFileSync(filePath, content, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              console.error('Save failed:', error);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Save failed' }));
            }
          });
          return;
        }

        // /api/load
        if (req.method === 'GET' && req.url?.startsWith('/api/load')) {
          try {
            const url = new URL(req.url, 'http://localhost');
            const filename = url.searchParams.get('filename');
            if (!filename) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Filename is required' }));
              return;
            }
            const filePath = path.join(cacheDir, filename);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ content }));
            } else {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ content: null }));
            }
          } catch (error) {
            console.error('Load failed:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Load failed' }));
          }
          return;
        }

        // 他のリクエストは次のミドルウェアへ
        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    apiMiddlewarePlugin(),
    react()
  ],
  server: {
    proxy: {
      // BigQuery APIをバックエンドサーバーにプロキシ（別途起動が必要）
      // Node.js 17以降のIPv6解決問題（localhost -> ::1）により503エラーになるのを防ぐため、127.0.0.1 を直接指定する。
      '/api/bq': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      },
      '/api/chats': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  }
})
