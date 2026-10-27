/**
 * monacoSetup.ts
 * @monaco-editor/react はデフォルトで CDN（cdn.jsdelivr.net）から Monaco 本体を取得する。
 * Electron ではCSPでブロックされ、オフライン環境では読み込みが止まる（ネットワーク
 * 依存のためエラーにもならず「読み込み中…」のまま固まる）。
 * ここでバンドル済みの monaco-editor パッケージを使うよう設定し、CDN依存を排除する。
 * TextEditorMedia.tsx から副作用importされ、モジュール初回評価時に一度だけ実行される。
 */

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

declare global {
  interface Window {
    monaco?: typeof monaco;
  }
}

const env: monaco.Environment = {
  getWorker: () => new EditorWorker(),
};
window.MonacoEnvironment = env;

loader.config({ monaco });

// TextEditorMedia.tsx は既存コードで window.monaco（AMD/CDNロード時のグローバル）を
// 直接参照している箇所が複数あるため、ESM化後も同じグローバルを維持する。
window.monaco = monaco;
