export const UNAVAILABLE_ACTIONS = {
  rollbackThink: {
    ActionID: 'Application.Resource.RollbackFocusedThink',
    Description: '直前にフォーカスされたThinkファイルをBQで1時間前の状態に戻す（未実装）',
    UnavailableReason: '巻戻（Think1件）は未実装です。',
  },
  rollbackAll: {
    ActionID: 'Application.Resource.RollbackAll',
    Description: 'BQ全体を1時間前の状態に戻す（未実装）',
    UnavailableReason: '巻戻（BQ全体）は未実装です。',
  },
  mail: {
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Mail:Open',
    Description: 'メールを開く、またはメール検索を行う（未実装）',
    UnavailableReason: 'Mailを開く操作は未実装です。',
  },
} as const;
