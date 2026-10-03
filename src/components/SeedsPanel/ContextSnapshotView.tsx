import type { ContextField, ContextSnapshot } from '../../services/contextTypes';

export const CONTEXT_LABELS: Record<ContextField, string> = {
  goal: '目的', stage: '段階', current: '現在の状況', provisionalConclusion: '暫定結論',
  decisions: '決定事項', openQuestions: '残る論点', nextAction: '次の行動',
  completionCriteria: '完了条件', legacyProposals: '旧AIの提案',
};

/** Presentation only: never adopts a legacy value as the Bundle's current decision. */
export function ContextSnapshotView({ snapshot, onOpen }: {
  snapshot: ContextSnapshot; onOpen: (id: string) => void;
}) {
  const titles = new Map([...snapshot.bundleDefinitions, ...snapshot.sources].map(s => [s.thinkId, s.title]));
  return <section aria-label="参照資料と過去の記録" className="context-snapshot">
    <h3>参照資料と過去の記録</h3>
    <p>読み込めた資料 {snapshot.sources.length}件 ／ 対象 {snapshot.resolvedThinkIds.length}件</p>
    <p>参照取得時刻：{snapshot.capturedAt}（更新後は再取得してください）</p>
    {snapshot.issues.length > 0 && <div role="status" className="context-snapshot__issues">
      <p>参照情報に確認が必要な点があります。</p>
      <ul>{snapshot.issues.map((issue, index) => <li key={`${issue.code}-${issue.thinkId}-${index}`}>
        {issue.message} <span>対象：{titles.get(issue.thinkId) || issue.thinkId}</span>
      </li>)}</ul>
    </div>}
    <details>
      <summary>出典ごとの記録を確認する</summary>
      <p>以下は元の記録です。Bundle全体の確定情報へ自動反映しません。</p>
      {Object.entries(CONTEXT_LABELS).map(([field, label]) => {
        const values = snapshot.state[field as ContextField];
        if (!values.length) return null;
        return <section key={field}><h4>{label}</h4><ul>{values.map((value, index) =>
          <li key={`${value.sourceThinkId}-${index}`}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{value.value}</p>
            <button type="button" onClick={() => onOpen(value.sourceThinkId)}>
              出典：{titles.get(value.sourceThinkId) || value.sourceThinkId}
            </button>
            {value.authority === 'legacy-ai-proposal' && <span>旧AIによる提案</span>}
            <p>旧記録全体の本人確認：{value.legacyConfirmation?.at || '未確認'}</p>
          </li>,
        )}</ul></section>;
      })}
    </details>
    <details>
      <summary>資料を開く</summary>
      <ul>{snapshot.sources.map(source => <li key={source.thinkId}>
        <button type="button" onClick={() => onOpen(source.thinkId)}>{source.title || source.thinkId}</button>
        {source.hasUnsavedChanges && <span>未保存の編集内容を参照しています。</span>}
      </li>)}</ul>
    </details>
  </section>;
}
