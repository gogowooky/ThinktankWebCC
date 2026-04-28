/**
 * ConflictResolver.ts
 * Phase 10 段204: オフライン編集中の衝突検出と保存
 *
 * 衝突時の動作:
 *  1. BQ版をメインとして維持
 *  2. ローカル版を `[元ID]_conflict_[日時]` という別メモとして保存
 *  3. 衝突件数をカウント（StatusBarや通知で使用）
 */

export interface ConflictInfo {
    originalMemoId: string;
    conflictMemoId: string;
    detectedAt: Date;
}

export class ConflictResolver {
    private _conflicts: ConflictInfo[] = [];

    /**
     * SyncQueue flush前に衝突を確認する。
     * localUpdateDate < BQ上の最新 updated_at なら衝突と判定。
     *
     * @param memoId         対象メモID
     * @param localUpdateDate ローカル変更のUpdateDate文字列（yyyymmdd-HHMMSS形式）
     * @returns 衝突している場合 true
     */
    async checkBeforeFlush(memoId: string, localUpdateDate: string): Promise<boolean> {
        try {
            const response = await fetch(`/api/bq/files/${encodeURIComponent(memoId)}`, {
                cache: 'no-store',
            });
            if (!response.ok) return false; // BQ取得失敗 = 衝突なしとして扱う

            const data = await response.json();
            const bqFile = data.file;
            if (!bqFile?.updated_at) return false;

            // BQ の updated_at を文字列に正規化
            let bqVal = bqFile.updated_at;
            if (typeof bqVal === 'object' && bqVal !== null && 'value' in bqVal) {
                bqVal = bqVal.value;
            }
            const bqDate = new Date(bqVal);
            if (isNaN(bqDate.getTime())) return false;

            const bqDateStr = this._toDateStr(bqDate);

            // ローカルの日付が BQ より古ければ衝突
            return localUpdateDate < bqDateStr;
        } catch {
            return false;
        }
    }

    /**
     * 衝突時: ローカル版を別メモとして保存する。
     * 元メモIDを `${memoId}_conflict_${timestamp}` として BQ に保存。
     *
     * @param memoId   元メモID
     * @param content  ローカルの現在コンテンツ
     * @param title    ローカルのタイトル
     */
    async saveConflictVersion(memoId: string, content: string, title: string): Promise<string | null> {
        const timestamp = this._toDateStr(new Date());
        const conflictId = `${memoId}_conflict_${timestamp}`;

        try {
            const response = await fetch('/api/bq/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_id: conflictId,
                    title: `[衝突] ${title}`,
                    file_type: 'md',
                    category: 'Memo',
                    content: `# [衝突コピー] ${title}\n作成: ${timestamp}\n元ID: ${memoId}\n\n---\n\n${content}`,
                }),
            });

            if (!response.ok) {
                console.error(`[ConflictResolver] 衝突メモ保存失敗: HTTP ${response.status}`);
                return null;
            }

            const info: ConflictInfo = {
                originalMemoId: memoId,
                conflictMemoId: conflictId,
                detectedAt: new Date(),
            };
            this._conflicts.push(info);
            console.log(`[ConflictResolver] 衝突検出: ${memoId} → ${conflictId}`);
            return conflictId;
        } catch (e) {
            console.error(`[ConflictResolver] 衝突メモ保存例外:`, e);
            return null;
        }
    }

    /** 今セッションで検出した衝突数 */
    get conflictCount(): number {
        return this._conflicts.length;
    }

    /** 衝突情報リスト */
    get conflicts(): readonly ConflictInfo[] {
        return this._conflicts;
    }

    /** 衝突リストをクリア */
    clearConflicts(): void {
        this._conflicts = [];
    }

    private _toDateStr(d: Date): string {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
    }
}

// シングルトン
export const conflictResolver = new ConflictResolver();
