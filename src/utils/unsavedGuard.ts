/**
 * unsavedGuard.ts
 * 「開いているペインの保留中の自動保存を即実行する」関数のレジストリ。
 *
 * TextEditorMedia がマウント時に登録し、ウィンドウ終了・タブ非表示・Electron の
 * close ダイアログで一括フラッシュする（PROJECT_REVIEW_REPORT.md D-1: 未保存データ損失の防止）。
 *
 * ここは「保存の起動」だけを担う。dirty 判定は area.IsDirty（TTWorkoutArea）、
 * 実際の保存は各メディアの onSave → TTThink.SaveContent が担う。
 */

/** ペインごとのフラッシュ関数。呼ぶと保留中の変更を保存し、その Promise を返す（同期完了なら void） */
type PaneFlush = () => void | Promise<unknown>;

const flushers = new Map<string, PaneFlush>();

export function registerPaneFlush(key: string, fn: PaneFlush): void {
  flushers.set(key, fn);
}

export function unregisterPaneFlush(key: string): void {
  flushers.delete(key);
}

/**
 * 登録済みの全ペインのフラッシュを起動し、すべての保存が終わる（成否問わず）まで待つ。
 * 1 ペインの失敗が他の保存を止めないよう allSettled で束ねる。
 */
export async function flushAllPanes(): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const fn of flushers.values()) {
    try {
      const r = fn();
      if (r) pending.push(Promise.resolve(r));
    } catch (e) {
      console.error('[unsavedGuard] flush failed', e);
    }
  }
  await Promise.allSettled(pending);
}

/** テスト・デバッグ用: 登録数 */
export function paneFlushCount(): number {
  return flushers.size;
}
