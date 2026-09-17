import { useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { readTaskRelation } from '../../services/taskRelation';
import { readSubtaskProgress, summarizeSubtaskProgress } from '../../services/subtaskProgress';
import { MILESTONES, MILESTONE_LABELS, REACH_LABELS } from '../../../server/services/progressRecord';
import { SubtaskChatButton } from './SubtaskChatButton';

export function SubtaskList({ vault, bundleId }: { vault: TTVault; bundleId: string }) {
  useAppUpdate(vault);
  const [message, setMessage] = useState('');
  const children = vault.GetBundles().filter(b => readTaskRelation(b.Metadata.taskRelation)?.parentId === bundleId);
  const progress = children.map(child => readSubtaskProgress(child.Metadata.thinkProgress));
  const summary = summarizeSubtaskProgress(progress);
  const relation = readTaskRelation(vault.GetThink(bundleId)?.Metadata.taskRelation);
  async function open(id: string) {
    try {
      const { TTApplication } = await import('../../views/TTApplication');
      const app = TTApplication.Instance;
      if (app.Models.Vault !== vault || vault.GetThink(id)?.ContentType !== 'bundle') throw new Error('課題が見つかりません。');
      app.OpenBundle(id, 'graph');
    } catch (e) { setMessage((e as Error).message); }
  }
  if (!children.length && !relation) return null;
  return <section aria-label="関連する課題">
    {relation && <><button type="button" onClick={() => void open(relation.parentId)}>親課題へ戻る</button>
      <SubtaskChatButton key={bundleId} vault={vault} bundleId={bundleId} overviewId={bundleId} /></>}
    {children.length > 0 && <><h3>サブ課題（{summary.total}件）</h3>
      <p>読み込み済みの直接のサブ課題について、本人が確認した到達状態を表示しています。親課題の完了は別に確認します。</p>
      <ul aria-label="サブ課題の到達状態の集計">{MILESTONES.map(key => <li key={key}>
        {MILESTONE_LABELS[key]}：{Object.entries(REACH_LABELS).map(([reach, label]) =>
          `${label} ${summary.milestones[key][reach as keyof typeof REACH_LABELS]}件`).join(' ／ ')}
      </li>)}</ul>
      <p>保留 {summary.paused}件{summary.unreadable > 0 && ` ／ 記録を読み取れない課題 ${summary.unreadable}件（到達状態の集計対象外）`}</p>
      <ul>{children.map((child, index) => <li key={child.ID}>
      <button type="button" onClick={() => void open(child.ID)}>{child.Name}</button> · 担当：Workout
      <SubtaskChatButton vault={vault} bundleId={child.ID} overviewId={bundleId} />
      <SubtaskProgressDetail progress={progress[index]} />
    </li>)}</ul></>}
    {message && <p role="status">{message}</p>}
  </section>;
}

function SubtaskProgressDetail({ progress }: { progress: ReturnType<typeof readSubtaskProgress> }) {
  if (progress.status === 'unreadable') return <p>到達状態の記録を読み取れません。課題を開いて確認してください。</p>;
  if (progress.status === 'unrecorded') return <p>到達状態は未記録です。</p>;
  const { input, confirmedAt } = progress.event;
  return <div>
    <p>{MILESTONES.map(key => `${MILESTONE_LABELS[key]}：${REACH_LABELS[input.milestones[key]]}`).join(' ／ ')}</p>
    {input.paused && <p>保留中 · 再開条件：{input.resumeCondition}</p>}
    <p style={{ whiteSpace: 'pre-wrap' }}>残課題：{input.remaining}</p>
    <details><summary>本人確認の根拠</summary>
      <p>本人確認：{confirmedAt}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{input.evidence}</p>
      {input.resumeSummary && <p style={{ whiteSpace: 'pre-wrap' }}>再開メモ：{input.resumeSummary}</p>}
      {input.reviewAt && <p>再確認日：{input.reviewAt}</p>}
    </details>
  </div>;
}
