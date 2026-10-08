/**
 * saveStatus.ts
 * 保存に失敗したまま未回復の Think を数え、画面側（ステータスバー）へ知らせる。
 *
 * 保存の呼び出し元の多くは失敗をコンソールに出すだけなので、ここを通さないと
 * 「保存されていない」ことにユーザーが気づけない。楽観ロックの衝突は App.tsx の
 * 確認ダイアログが扱うため、ここでは数えない。
 */

type Listener = (failingCount: number) => void;

const failing = new Set<string>();
const listeners = new Set<Listener>();

export function reportSaveResult(thinkId: string, failed: boolean): void {
  const had = failing.has(thinkId);
  if (failed) failing.add(thinkId); else failing.delete(thinkId);
  if (had === failed) return;
  for (const l of listeners) l(failing.size);
}

export function onSaveStatusChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function failingSaveCount(): number {
  return failing.size;
}
