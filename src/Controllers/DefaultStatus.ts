/**
 * DefaultStatus.ts
 * 状態管理変数の初期化エントリポイント
 *
 * 各カテゴリの状態登録は Status/ 配下のファイルに分離されています。
 * どのカテゴリにも該当しない状態はこのファイルに直接追加してください。
 *
 * 記述ルール:
 * - RegisterState() の第一・第二パラメータは直接文字列を使用
 * - Default/Apply/Watch 関数本体内のみでヘルパー関数を使用可
 */

import { TTModels } from '../models/TTModels';

// 各カテゴリの登録関数
import { registerApplicationStatus } from './Status/ApplicationStatus';
import { registerEditorStatus } from './Status/EditorStatus';
import { registerTableStatus } from './Status/TableStatus';

export function InitializeDefaultStatus(models: TTModels) {
    // === 各カテゴリの状態を登録 ===
    registerApplicationStatus(models);
    registerEditorStatus(models);
    registerTableStatus(models);

    // === 未分類の状態 ===
    // どのカテゴリにも該当しない状態はここに追加してください。
    // カテゴリが明確になった時点で適切なファイルへ移動してください。
}
