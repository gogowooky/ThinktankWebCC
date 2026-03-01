/**
 * StateHelpers.ts
 * DefaultStatus.ts のスクリプト本体内で使用するヘルパー関数
 * 
 * 注意: これらの関数は RegisterState() の Default/Apply/Watch 関数内でのみ使用してください。
 *       パラメータ部分（第一・第二引数）では使用しないでください。
 */

import { TTApplication } from '../../Views/TTApplication';
import type { TTPanel } from '../../Views/TTPanel';

// TTStatus の型をインポート（循環参照回避のため type のみ）
import type { TTStatus } from '../../models/TTStatus';

/**
 * IDからパネル名を抽出
 * 例: "Desk.Editor.Keyword" → "Desk"
 * 
 * @param id ステータスID
 * @returns パネル名
 */
export function GetPanelName(id: string): string {
    return id.split('.')[0];
}

/**
 * IDからパネルインスタンスを取得
 * 
 * @param id ステータスID
 * @returns TTPanel インスタンス または null
 */
export function GetPanel(id: string): TTPanel | null {
    return TTApplication.Instance.GetPanel(GetPanelName(id));
}

/**
 * 値の解決（next/prev または 直接値）
 * 
 * @param current 現在の値
 * @param options 選択肢の配列
 * @param input 'next' | 'prev' または直接値
 * @returns 解決された値 または null（無効な場合）
 * 
 * 使用例:
 *   ResolveValue(panel.Mode, ['Editor', 'Table', 'WebView'], 'next')
 *   ResolveValue('on', ['on', 'off'], val) // val が 'next'/'prev' または 'on'/'off'
 */
export function ResolveValue<T extends string>(
    current: T,
    options: readonly T[],
    input: string
): T | null {
    // next/prev 以外の場合は、直接値として扱う
    if (input !== 'next' && input !== 'prev') {
        return options.includes(input as T) ? (input as T) : null;
    }

    const idx = options.indexOf(current);
    if (idx === -1) return null;

    if (input === 'next') {
        return options[(idx + 1) % options.length];
    } else {
        return options[(idx - 1 + options.length) % options.length];
    }
}

/**
 * パネル値監視の共通パターン
 * Watch 関数内で使用
 * 
 * @param status TTStatus インスタンス
 * @param id ステータスID
 * @param getValue パネルから値を取得する関数
 * 
 * 使用例:
 *   Watch: (id) => {
 *       BindPanelWatch(status, id, (panel) => panel.Mode);
 *   }
 */
export function BindPanelWatch(
    status: TTStatus,
    id: string,
    getValue: (panel: TTPanel) => string
): void {
    // Use retry logic by default to handle initialization order
    BindPanelWatchWithRetry(status, id, getValue);
}

/**
 * リトライ付きパネル値監視
 * パネル初期化前に Watch が呼ばれた場合に対応
 * 
 * @param status TTStatus インスタンス
 * @param id ステータスID
 * @param getValue パネルから値を取得する関数
 * @param maxAttempts 最大リトライ回数（デフォルト: 10）
 * 
 * 使用例:
 *   Watch: (id) => {
 *       BindPanelWatchWithRetry(status, id, (panel) => panel.TableSortDir);
 *   }
 */
export function BindPanelWatchWithRetry(
    status: TTStatus,
    id: string,
    getValue: (panel: TTPanel) => string,
    maxAttempts: number = 10
): void {
    const tryBind = (attempt: number) => {
        const panel = GetPanel(id);
        if (panel) {
            panel.AddOnUpdate(`State:${id}`, () => {
                const currentVal = status.GetValue(id);
                const panelVal = getValue(panel);
                if (currentVal !== panelVal) {
                    status.SetValue(id, panelVal);
                }
            });
        } else if (attempt < maxAttempts) {
            setTimeout(() => tryBind(attempt + 1), 100);
        } else {
            console.warn(`[Status] Failed to bind watch for ${id} after ${maxAttempts} attempts`);
        }
    };
    tryBind(0);
}
