import { useReducer } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ContextService } from '../../services/ContextService';
import { StorageManager } from '../../services/storage/StorageManager';
import { ProgressService, type ProgressState } from '../../services/ProgressService';
import { emptyProgress, validateProgress, readProgress, MILESTONES, MILESTONE_LABELS, REACH_LABELS, type ProgressInput, type Reach } from '../../../server/services/progressRecord';
import type { ContextSource } from '../../services/contextTypes';
import './BundleProgress.css';

interface Draft { input: ProgressInput; base?: ProgressState; remote?: ProgressState; operationId: string; dirty: boolean; confirmed: boolean; busy: boolean; message: string; sources: readonly ContextSource[] }
const drafts = new WeakMap<TTVault, Map<string, Draft>>();
const service = new ProgressService();
function getDraft(vault: TTVault, id: string) {
  let map = drafts.get(vault);
  if (!map) {
    map = new Map(); drafts.set(vault, map); const records = map;
    window.addEventListener('beforeunload', e => {
      if ([...records.values()].some(d => d.dirty || d.busy)) { e.preventDefault(); e.returnValue = ''; }
    });
  }
  let draft = map.get(id);
  if (!draft) { draft = { input: emptyProgress(), operationId: crypto.randomUUID(), dirty: false, confirmed: false, busy: false, message: '', sources: [] }; map.set(id, draft); }
  return draft;
}
function current(state: ProgressState): ProgressInput { return state.log.events[state.log.events.length - 1]?.input ?? emptyProgress(); }
const fields = { evidence: '確認根拠・変更理由（必須）', remaining: '残課題とその扱い（なければ「なし」）', resumeSummary: '再開時の要約', resumeCondition: '再開条件・待っている情報（保留時必須）' } as const;
function Summary({ input, onOpen }: { input: ProgressInput; onOpen: (id: string) => void }) {
  return <div className="progress-summary">
    <p>{MILESTONES.map(k => `${MILESTONE_LABELS[k]}：${REACH_LABELS[input.milestones[k]]}`).join(' ／ ')}</p>
    <p>進め方：{input.paused ? '保留' : '保留していない'}</p>
    {Object.entries(fields).map(([key, label]) => <p key={key}><strong>{label}：</strong>{input[key as keyof typeof fields] || '未記録'}</p>)}
    <p>再確認日：{input.reviewAt || '未記録'}</p>
    {input.sources.map(s => <p key={s.thinkId}><button type="button" onClick={() => onOpen(s.thinkId)}>根拠資料：{s.thinkId}</button><small>記録時の本文ハッシュ：{s.contentHash}</small></p>)}
  </div>;
}
export function BundleProgress({ vault, bundleId, onOpen }: { vault: TTVault; bundleId: string; onOpen: (id: string) => void }) {
  useAppUpdate(vault);
  const [, render] = useReducer(n => n + 1, 0);
  const draft = getDraft(vault, bundleId);
  const supported = StorageManager.instance.mode === 'pwa';
  function notify() { render(); vault.NotifyUpdated(false); }
  function change(input: ProgressInput) {
    if (draft.busy) return;
    Object.assign(draft, { input, operationId: crypto.randomUUID(), dirty: true, confirmed: false, message: '' }); notify();
  }
  function adopt(state: ProgressState) {
    Object.assign(draft, { base: state, remote: undefined, input: structuredClone(current(state)), operationId: crypto.randomUUID(), dirty: false, confirmed: false });
  }
  async function load() {
    if (draft.busy) return;
    draft.busy = true; draft.message = ''; draft.confirmed = false; notify();
    try {
      const state = await service.read(bundleId);
      if (draft.dirty) { draft.remote = state; draft.message = '最新の保存内容と入力を比較してください。'; } else adopt(state);
    } catch (e) { draft.message = (e as Error).message; }
    finally { draft.busy = false; notify(); }
  }
  async function loadSources() {
    if (draft.busy) return;
    draft.busy = true; draft.confirmed = false; notify();
    try {
      const snapshot = await new ContextService(vault).getBundleContext(bundleId);
      draft.sources = snapshot.sources;
      draft.message = snapshot.issues.length ? snapshot.issues.map(i => i.message).join('\n') : '根拠資料を取得しました。';
    } catch (e) { draft.message = (e as Error).message; }
    finally { draft.busy = false; notify(); }
  }
  async function save() {
    if (!draft.base || !draft.confirmed || !draft.dirty || draft.remote || draft.busy) return;
    draft.busy = true; draft.message = ''; notify();
    try {
      validateProgress(draft.input);
      const state = await service.save(bundleId, draft.base.version, draft.operationId, draft.input);
      // Keep the editor's whole-record version conservative; other metadata may have changed remotely.
      const live = vault.GetThink(bundleId);
      if (live) {
        const dirty = live.IsMetadataDirty;
        live.Metadata = { ...live.Metadata, thinkProgress: state.log };
        if (!dirty) live.markMetadataSaved();
      }
      adopt(state); draft.message = '本人確認済みの到達状態を保存しました。';
    } catch (e) { draft.message = (e as Error).message; draft.confirmed = false; }
    finally { draft.busy = false; notify(); }
  }
  function exportHistory() {
    const payload = { bundleId, saved: draft.base?.log, unsaved: draft.dirty ? draft.input : undefined };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `think-progress-${bundleId}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  let local;
  let localError = '';
  try { local = readProgress(vault.GetThink(bundleId)?.Metadata.thinkProgress); } catch (e) { localError = (e as Error).message; }
  return <section className="bundle-progress" aria-label="進行と到達状態">
    <h3>進行と到達状態</h3><p>必要な範囲だけ記録します。「実行」と「検証」は別の到達状態です。旧「完了」やAI提案から自動確定しません。</p>
    {!supported ? <>{localError && <p role="alert">{localError}</p>}<p>保存はBigQueryモードで利用できます。</p>{local?.events.map(e => <details key={e.id}><summary>{e.confirmedAt} · 本人確認済み</summary><Summary input={e.input} onOpen={onOpen} /></details>)}</> : <>
      <button type="button" disabled={draft.busy} onClick={() => void load()}>到達状態を取得・比較</button>
      {draft.base && <>
        <section aria-label="保存済みの到達状態"><h4>保存済みの記録と再開メモ</h4>
          {!draft.base.log.events.length ? <p>到達状態は未記録です。</p> : <><p>本人確認：{draft.base.log.events[draft.base.log.events.length - 1].confirmedAt}</p><Summary input={current(draft.base)} onOpen={onOpen} /></>}
          <p>目的：{draft.base.review.goal || '未記録'} ／ 次の行動：{draft.base.review.nextAction || '未記録'}</p>
          <p>完了条件：{draft.base.review.completionCriteria || '未記録'}</p>
          {current(draft.base).reviewAt && current(draft.base).reviewAt <= new Date().toLocaleDateString('sv-SE') && <p role="status">再確認日を迎えています。再開条件を確認してください。</p>}
        </section>
        <details><summary>進め方の見直し候補（自動確定しません）</summary><p>記録の不足と同じ質問の繰り返しから、機械的に示しています。</p><ul>{draft.base.review.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>
        {draft.dirty && <p role="status">未保存の入力があります。Bundle切替後も保持します。</p>}
        <fieldset disabled={draft.busy}><legend>本人が確認した到達状態を記録</legend>
          {MILESTONES.map(k => <label key={k}>{MILESTONE_LABELS[k]}<select value={draft.input.milestones[k]} onChange={e => change({ ...draft.input, milestones: { ...draft.input.milestones, [k]: e.target.value as Reach } })}>
            {Object.entries(REACH_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>)}
          <label><input type="checkbox" checked={draft.input.paused} onChange={e => change({ ...draft.input, paused: e.target.checked })} />保留する（再開時はチェックを外し、理由を残す）</label>
          {Object.entries(fields).map(([key, label]) => <label key={key}>{label}<textarea maxLength={4000} value={draft.input[key as keyof typeof fields]} onChange={e => change({ ...draft.input, [key]: e.target.value })} /></label>)}
          <label>再確認日（任意・アプリ内表示のみ）<input type="date" value={draft.input.reviewAt} onChange={e => change({ ...draft.input, reviewAt: e.target.value })} /></label>
          <button type="button" onClick={() => void loadSources()}>根拠資料を取得</button>
          {draft.sources.map(s => <label key={s.thinkId}><input type="checkbox" checked={draft.input.sources.some(p => p.thinkId === s.thinkId && p.contentHash === s.contentHash)} onChange={e => change({ ...draft.input, sources: [...draft.input.sources.filter(p => p.thinkId !== s.thinkId), ...(e.target.checked ? [{ thinkId: s.thinkId, contentHash: s.contentHash }] : [])] })} />{s.title || s.thinkId}</label>)}
          {draft.input.sources.map(s => <div key={s.thinkId}><button type="button" onClick={() => onOpen(s.thinkId)}>選択済み根拠：{s.thinkId}</button>{' '}<button type="button" onClick={() => change({ ...draft.input, sources: draft.input.sources.filter(p => p.thinkId !== s.thinkId) })}>根拠の選択を解除</button>
            {!draft.sources.some(p => p.thinkId === s.thinkId && p.contentHash === s.contentHash) && <p>この根拠の本文は未取得、または記録時から変更されています。内容を確認してください。</p>}</div>)}
          <details><summary>保存する内容を確認</summary><Summary input={draft.input} onOpen={onOpen} /></details>
          <label><input type="checkbox" checked={draft.confirmed} onChange={e => { draft.confirmed = e.target.checked; notify(); }} />根拠・残課題・到達状態を本人の判断として確認しました</label>
          <button type="button" disabled={!draft.dirty || !draft.confirmed || !!draft.remote} onClick={() => void save()}>到達状態を保存</button>
        </fieldset>
        {draft.remote && <section aria-label="到達状態の競合比較"><h4>最新保存内容（現在の入力は保持中）</h4><Summary input={current(draft.remote)} onOpen={onOpen} />
          <button type="button" disabled={draft.busy} onClick={() => { draft.base = draft.remote; draft.remote = undefined; draft.confirmed = false; draft.operationId = crypto.randomUUID(); notify(); }}>比較後、現在の入力を再確認</button>{' '}
          <button type="button" disabled={draft.busy} onClick={() => { adopt(draft.remote!); notify(); }}>入力を破棄して保存内容を採用</button></section>}
        <details><summary>本人確認の履歴（{draft.base.log.events.length}件）</summary>{[...draft.base.log.events].reverse().map(e => <details key={e.id}><summary>第{e.revision}版 · {e.confirmedAt}</summary><Summary input={e.input} onOpen={onOpen} /></details>)}</details>
        <button type="button" onClick={exportHistory}>到達状態と下書きをJSONで書き出す</button>
      </>}
      {draft.busy && <p role="status">保存先・資料を確認しています…</p>}{draft.message && <p role="status">{draft.message}</p>}
    </>}
  </section>;
}
