import { StorageConflictError } from '../services/storage/IStorageBackend';

/**
 * 保存失敗をログに出す。
 * 楽観ロックの衝突（PROJECT_REVIEW_REPORT.md D-2）は握り潰さず再送出し、
 * App.tsx の unhandledrejection ハンドラー → 確認ダイアログに繋ぐ。
 */
export function reportSaveError(context: string, err: unknown): void {
  console.error(context, err);
  if (err instanceof StorageConflictError) throw err;
}
