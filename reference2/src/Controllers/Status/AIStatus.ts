/**
 * AIStatus.ts
 * Phase 12 段268: AI Facilitator 設定ステータス
 *
 * 登録ステータス:
 *   AI.Facilitator.Enabled          - Facilitator有効/無効 ('true' | 'false')
 *   AI.Facilitator.RecallInterval   - 関連メモチェック間隔（分、デフォルト30）
 *   AI.Facilitator.AutoTag          - 保存時自動タグ有効/無効
 *   AI.Facilitator.AnniversaryRecall - 記念日リコール有効/無効
 *   AI.Facilitator.RelatedRecall    - 関連メモリコール有効/無効
 */

import { TTModels } from '../../models/TTModels';
import { TTApplication } from '../../Views/TTApplication';

export function registerAIStatus(models: TTModels) {
    const status = models.Status;

    // Facilitator全体の有効/無効
    status.RegisterState('AI.Facilitator.Enabled', 'AI Facilitator有効', {
        Default: () => 'true',
        Apply: (_id: string, value: string) => {
            const app = TTApplication.Instance;
            if (value === 'true') {
                app.startFacilitator(models);
            } else {
                app.stopFacilitator();
            }
        },
    });

    // 関連メモチェックの間隔（分）
    status.RegisterState('AI.Facilitator.RecallInterval', 'リコール間隔(分)', {
        Default: () => '30',
        Test: (_id: string, val: string) => /^\d+$/.test(val) && parseInt(val, 10) >= 1,
    });

    // 保存時自動タグ付与の有効/無効
    status.RegisterState('AI.Facilitator.AutoTag', '自動タグ付与有効', {
        Default: () => 'true',
        Test: (_id: string, val: string) => val === 'true' || val === 'false',
    });

    // 記念日リコールの有効/無効
    status.RegisterState('AI.Facilitator.AnniversaryRecall', '記念日リコール有効', {
        Default: () => 'true',
        Test: (_id: string, val: string) => val === 'true' || val === 'false',
    });

    // 関連メモリコールの有効/無効
    status.RegisterState('AI.Facilitator.RelatedRecall', '関連メモリコール有効', {
        Default: () => 'true',
        Test: (_id: string, val: string) => val === 'true' || val === 'false',
    });
}
