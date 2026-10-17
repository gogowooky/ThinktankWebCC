/**
 * apiClient.ts
 * ローカル中継（scripts/run-relay-agent.mjs）への HTTP 呼び出し。
 *
 * 使うのはブラウザ版をローカル中継で動かす開発時（npm run dev:web-relay）だけで、
 * 相対パスの '/api/...' を Vite の dev プロキシが 127.0.0.1:8080 へ転送する。
 * Electron 版は IPC、Firebase Hosting 版は Drive API と Firestore 中継を使うため通らない。
 */

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, init);
}

export { readApiJson } from './apiResponse';
