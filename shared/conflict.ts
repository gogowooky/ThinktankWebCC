/**
 * shared/conflict.ts
 * 保存直前の版比較・楽観ロック・Drive for desktop の衝突コピー検出ロジック。
 */

export interface RecordVersionSnapshot {
  exists: boolean;
  updatedAt: string | null;
  contentHash?: string | null;
  driveVersion?: string | null;
}

export interface ConflictCheckResult {
  ok: boolean;
  reason?: 'modified_externally' | 'deleted_externally' | 'created_externally' | 'hash_mismatch';
  currentUpdatedAt?: string | null;
}

/**
 * 既存の updatedAt より必ず未来（最低 +1ms）になる ISO 8601 タイムスタンプを返す。
 */
export function nextVersionTimestamp(previousUpdatedAt?: string | null, nowMs: number = Date.now()): string {
  const prevMs = previousUpdatedAt ? Date.parse(previousUpdatedAt) : 0;
  const safePrev = Number.isFinite(prevMs) ? prevMs : 0;
  return new Date(Math.max(nowMs, safePrev + 1)).toISOString();
}

/**
 * 読み込んだ時点の expectedVersion（baseUpdatedAt）と保存直前の現在状態を比較する。
 */
export function verifyNoConflict(
  current: RecordVersionSnapshot,
  expectedUpdatedAt?: string | null,
  expectedHash?: string | null,
): ConflictCheckResult {
  if (!expectedUpdatedAt) {
    return { ok: true };
  }
  if (!current.exists) {
    return { ok: false, reason: 'deleted_externally', currentUpdatedAt: null };
  }
  if (current.updatedAt !== expectedUpdatedAt) {
    const curMs = current.updatedAt ? Date.parse(current.updatedAt) : NaN;
    const expMs = Date.parse(expectedUpdatedAt);
    if (!Number.isFinite(curMs) || !Number.isFinite(expMs) || curMs !== expMs) {
      return {
        ok: false,
        reason: 'modified_externally',
        currentUpdatedAt: current.updatedAt,
      };
    }
  }
  if (expectedHash && current.contentHash && current.contentHash !== expectedHash) {
    return {
      ok: false,
      reason: 'hash_mismatch',
      currentUpdatedAt: current.updatedAt,
    };
  }
  return { ok: true, currentUpdatedAt: current.updatedAt };
}

export interface DriveConflictFileInfo {
  filename: string;
  baseThinkId: string;
  kind: 'md' | 'support';
  copyTag: string;
}

/**
 * Drive for desktop が同時更新時に生成する衝突ファイル（例: "2026-10-16-093000 (1).md"）を検出する。
 */
export function parseDriveConflictFilename(filename: string): DriveConflictFileInfo | null {
  const mdMatch = filename.match(/^([A-Za-z0-9_-]{1,200})\s+\(([^)]+)\)\.md$/i);
  if (mdMatch) {
    return {
      filename,
      baseThinkId: mdMatch[1],
      kind: 'md',
      copyTag: mdMatch[2],
    };
  }
  const supportMatch = filename.match(
    /^([A-Za-z0-9_-]{1,200})(?:\.support\s+\(([^)]+)\)|\s+\(([^)]+)\)\.support)\.json$/i,
  );
  if (supportMatch) {
    return {
      filename,
      baseThinkId: supportMatch[1],
      kind: 'support',
      copyTag: supportMatch[2] ?? supportMatch[3] ?? 'conflict',
    };
  }
  return null;
}
