import type { SubtaskContext, ProgressContext } from '../../../server/services/subtaskContext';
import { MILESTONES, MILESTONE_LABELS, REACH_LABELS } from '../../../server/services/progressRecord';

export function SubtaskContextView({ value, onOpen }: { value: SubtaskContext; onOpen: (id: string) => void }) {
  return <details><summary>子課題の状況（{value.items.length}件）</summary>
    <p>読み込み済みの直接の子課題のみです。保存先の最新状態や全子孫を網羅するものではありません。送信時に読み込み済みの記録を取り直します。子課題の資料本文は追加しません。</p>
    {!value.items.length && <p>対象の子課題はありません。課題全体の完了を意味しません。</p>}
    {value.items.map(item => <div key={item.bundleId}>
      <button type="button" onClick={() => onOpen(item.bundleId)}>{item.title || item.bundleId}</button>
      <ProgressContextDetail item={item} />
    </div>)}
  </details>;
}
export function ProgressContextDetail({ item }: { item: ProgressContext }) {
  const labels = { unrecorded: '到達状態は未記録', unreadable: '記録を読み取れません', unsaved: '未保存の変更があるため到達状態を参照しません' };
  return item.status !== 'recorded' ? <p>{labels[item.status]}</p> : item.event && <>
        <p>本人確認：{item.event.confirmedAt}</p>
        <p>{MILESTONES.map(k => `${MILESTONE_LABELS[k]}：${REACH_LABELS[item.event!.input.milestones[k]]}`).join(' ／ ')}</p>
        <p>残課題：{item.event.input.remaining}</p>
        <p>確認根拠：{item.event.input.evidence}</p>
        <p>進め方：{item.event.input.paused ? '保留' : '保留していない'} ／ 再開条件：{item.event.input.resumeCondition || '未記録'}</p>
        {item.event.input.resumeSummary && <p>再開メモ：{item.event.input.resumeSummary}</p>}
        {item.event.input.reviewAt && <p>再確認日：{item.event.input.reviewAt}</p>}
      </>;
}
