/**
 * AnniversaryRecallEngine.ts
 * Phase 12 段262: 記念日リコールエンジン（ローカル動作・AI不要）
 *
 * メモのUpdateDateから「N年前」「Nヶ月前」「N週間前」のメモを検索して返す。
 * IndexedDB / ローカルキャッシュのメモのみを使用するため、オフラインでも動作する。
 */

import type { TTMemo } from '../../models/TTMemo';

export interface AnniversaryMatch {
    memo: TTMemo;
    period: string;    // "1年前" | "6ヶ月前" | "3ヶ月前" | "1ヶ月前" | "1週間前"
    priority: number;  // 0-100
}

export class AnniversaryRecallEngine {
    /**
     * 「N日前」「N週間前」「N月前」「N年前」のメモを検索する
     */
    public async findAnniversaryMemos(memos: TTMemo[]): Promise<AnniversaryMatch[]> {
        const now = new Date();
        const matches: AnniversaryMatch[] = [];

        for (const memo of memos) {
            const memoDate = this._parseDate(memo.UpdateDate);
            if (!memoDate) continue;

            const diffDays = Math.floor(
                (now.getTime() - memoDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            // 1年前 (±3日の誤差を許容)
            if (Math.abs(diffDays - 365) <= 3) {
                matches.push({ memo, period: '1年前', priority: 90 });
            }
            // 2年前
            if (Math.abs(diffDays - 730) <= 3) {
                matches.push({ memo, period: '2年前', priority: 85 });
            }
            // 3年前
            if (Math.abs(diffDays - 1095) <= 3) {
                matches.push({ memo, period: '3年前', priority: 80 });
            }
            // 6ヶ月前
            if (Math.abs(diffDays - 182) <= 3) {
                matches.push({ memo, period: '6ヶ月前', priority: 70 });
            }
            // 3ヶ月前
            if (Math.abs(diffDays - 91) <= 3) {
                matches.push({ memo, period: '3ヶ月前', priority: 50 });
            }
            // 1ヶ月前
            if (Math.abs(diffDays - 30) <= 2) {
                matches.push({ memo, period: '1ヶ月前', priority: 40 });
            }
            // 1週間前
            if (diffDays === 7) {
                matches.push({ memo, period: '1週間前', priority: 30 });
            }
        }

        return matches.sort((a, b) => b.priority - a.priority);
    }

    /** UpdateDateの文字列（"YYYY-MM-DD-HHmmss" or ISO形式）をDateに変換 */
    private _parseDate(dateStr: string): Date | null {
        if (!dateStr) return null;

        // "YYYY-MM-DD-HHmmss" 形式（TTObjectのgetNowString形式）
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/);
        if (m) {
            return new Date(
                Number(m[1]), Number(m[2]) - 1, Number(m[3]),
                Number(m[4]), Number(m[5]), Number(m[6])
            );
        }

        // ISO 8601 形式
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;

        return null;
    }
}
