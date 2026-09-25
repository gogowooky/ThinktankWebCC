import { useEffect, useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { ConversationClient } from '../../services/ConversationService';
import { findSimilarTasks } from '../../services/similarTasks';

export function SimilarTasks({ vault, chatId, bundleId, onOpen }: {
  vault: TTVault; chatId: string; bundleId?: string; onOpen: (id: string) => Promise<void>;
}) {
  const [result, setResult] = useState<ReturnType<typeof findSimilarTasks>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setResult(undefined); setError('');
    try {
      const turns = await new ConversationClient().history(undefined, controller.signal, chatId, vault.ID, vault);
      if (!controller.signal.aborted) setResult(findSimilarTasks(vault, chatId, turns, bundleId));
    } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
    finally { if (!controller.signal.aborted) { request.current = undefined; setBusy(false); } }
  }
  return <div className="support-similar-tasks">
    <button type="button" disabled={busy} onClick={() => void search()}>{busy ? '課題を調査しています…' : '相談に類似した課題を調査'}</button>
    {error && <p role="status">{error}</p>}
    {result && <div aria-label="類似する課題の調査結果">
      <p>読み込み済みの課題{result.searched}件を、相談と課題名・目的・完了条件の共通語で照合しました。</p>
      {!result.results.length && <p>この範囲では類似候補が見つかりませんでした。</p>}
      {result.results.map(task => <article key={task.id}>
        <strong>{task.title}</strong><p>共通する語：{task.matches.join('、')}</p>
        <p>目的：{task.goal || '未記録'}</p><p>完了条件：{task.completion || '未記録'}</p>
        <button type="button" onClick={() => void onOpen(task.id).catch(e => setError((e as Error).message))}>この課題をOverviewで開く</button>
      </article>)}
      <p>候補を開いても、相談の関連付け・参照範囲は変わりません。</p>
    </div>}
  </div>;
}
