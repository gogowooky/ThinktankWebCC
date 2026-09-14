import { useEffect, useReducer, useRef } from 'react';
import type { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { StorageManager } from '../../services/storage/StorageManager';
import { ContextService } from '../../services/ContextService';
import { conversationContext, type ConversationContext } from '../../services/ConversationService';
import { AgentClient, type AgentState } from '../../services/AgentClient';
import { AGENT_KINDS, AGENT_STATUS, artifactFor, type AgentJob, type AgentKind } from '../../../server/services/agentRecord';
import { canonicalJson } from '../../../server/services/conversationRecord';
import './BundleAgent.css';

interface Draft {
  kind: AgentKind; instruction: string; jobId: string; context?: ConversationContext; state?: AgentState;
  availability?: { enabled: boolean; provider: string; model: string }; confirmed: boolean;
  busy: boolean; running?: string; message: string; approvals: Set<string>;
}
const drafts = new WeakMap<TTVault, Map<string, Draft>>();
const client = new AgentClient();
function getDraft(vault: TTVault, bundleId: string) {
  let map = drafts.get(vault);
  if (!map) {
    map = new Map(); drafts.set(vault, map); const records = map;
    window.addEventListener('beforeunload', e => {
      if ([...records.values()].some(d => d.busy || d.running || d.instruction)) { e.preventDefault(); e.returnValue = ''; }
    });
  }
  let draft = map.get(bundleId);
  if (!draft) { draft = { kind: 'summary', instruction: '', jobId: crypto.randomUUID(), confirmed: false, busy: false, message: '', approvals: new Set() }; map.set(bundleId, draft); }
  return draft;
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BundleAgent({ vault, bundleId, onOpen }: { vault: TTVault; bundleId: string; onOpen: (id: string) => void }) {
  useAppUpdate(vault); const [, render] = useReducer(n => n + 1, 0);
  const draft = getDraft(vault, bundleId); const supported = StorageManager.instance.mode === 'pwa';
  const activeTarget = useRef<{ vault: TTVault; bundleId: string } | null>(null);
  activeTarget.current = { vault, bundleId };
  useEffect(() => () => { activeTarget.current = null; }, []);
  function notify() { render(); vault.NotifyUpdated(false); }
  async function refresh() {
    const state = await client.read(bundleId);
    if (!draft.state || Date.parse(state.version) >= Date.parse(draft.state.version)) draft.state = state;
    draft.approvals.clear(); notify();
  }
  async function load() {
    if (draft.busy) return;
    draft.busy = true; draft.message = ''; notify();
    try { await refresh(); draft.availability = await client.status(); }
    catch (e) { draft.message = (e as Error).message; }
    finally { draft.busy = false; notify(); }
  }
  async function prepare() {
    if (draft.busy || draft.running) return;
    draft.busy = true; draft.confirmed = false; draft.context = undefined; notify();
    try { draft.context = conversationContext(await new ContextService(vault).getBundleContext(bundleId)); draft.jobId = crypto.randomUUID(); draft.message = '取得時点の資料を確認してください。'; }
    catch (e) { draft.message = (e as Error).message; }
    finally { draft.busy = false; notify(); }
  }
  async function create() {
    if (!draft.context || !draft.confirmed || draft.busy || draft.running) return;
    draft.busy = true; notify();
    try {
      await client.create(draft.jobId, draft.kind, draft.instruction, draft.context);
      draft.context = undefined; draft.confirmed = false; draft.instruction = ''; await refresh();
      draft.message = 'ジョブを登録しました。保存済み資料を確認して実行してください。';
    } catch (e) { draft.message = (e as Error).message; }
    finally { draft.busy = false; notify(); }
  }
  async function run(job: AgentJob) {
    if (draft.running || draft.busy || !draft.availability?.enabled || !draft.approvals.has(job.id)) return;
    draft.running = job.id; draft.message = 'AI処理を実行しています。ジョブの中断ボタンで停止できます。'; draft.approvals.delete(job.id); notify();
    try { await client.action(bundleId, job.id, 'run', { retry: job.status !== 'queued' }); await refresh(); draft.message = '処理結果を取得しました。成功は課題の完了を意味しません。'; }
    catch (e) { draft.message = (e as Error).message; }
    finally { draft.running = undefined; notify(); }
  }
  async function cancel(job: AgentJob) {
    if (draft.busy) return;
    draft.busy = true; notify();
    try { await client.action(bundleId, job.id, 'cancel'); await refresh(); draft.message = '中断状態を確認しました。会話や音声の停止とは独立しています。'; }
    catch (e) { draft.message = (e as Error).message; }
    finally { draft.busy = false; notify(); }
  }
  async function apply(job: AgentJob) {
    if (draft.busy || draft.running || !draft.state || !draft.approvals.has(job.id)) return;
    draft.busy = true; draft.approvals.delete(job.id); notify();
    try {
      const current = conversationContext(await new ContextService(vault).getBundleContext(bundleId));
      const sources = (c: ConversationContext) => c.sources.map(s => [s.thinkId, s.contentHash]).sort((a, b) => a[0].localeCompare(b[0]));
      if (canonicalJson(sources(current)) !== canonicalJson(sources(job.context)) || canonicalJson(current.manualState) !== canonicalJson(job.context.manualState)) throw new Error('参照資料または手動記録が生成時点から変わっています。Markdownで保存するか、新しいジョブを作成してください。');
      const artifact = artifactFor(job);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`# ${artifact.title}\n${artifact.body}`));
      const contentHash = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      await client.action(bundleId, job.id, 'apply', { expectedVersion: draft.state.version, contentHash });
      await refresh(); draft.message = '新しいThinkへ追加しました。Bundleの資料定義と到達状態は変更していません。';
    } catch (e) { draft.message = (e as Error).message; }
    finally { draft.busy = false; notify(); }
  }
  async function open(job: AgentJob) {
    if (!job.applied) return;
    try {
      if (!vault.GetThink(job.applied.thinkId)) {
        const value = await client.artifact(bundleId, job.id);
        if (value.id !== job.applied.thinkId) throw new Error('成果物のIDが一致しません。');
        // Never replace an editor that appeared while the read was in flight.
        if (!vault.GetThink(value.id)) {
          const think = new TTThink(); think.ID = value.id; think.ContentType = 'memo'; think.setContentSilent(value.fullContent);
          think.UpdatedAt = value.updatedAt; think.Metadata = value.metadata; think.markSaved(); think.markMetadataSaved(); vault.AddThink(think);
        }
      }
      if (activeTarget.current?.vault === vault && activeTarget.current.bundleId === bundleId) onOpen(job.applied.thinkId);
    } catch (e) { draft.message = (e as Error).message; notify(); }
  }
  const jobs = draft.state?.log.jobs.filter(j => j.context.vaultId === vault.ID) ?? [];
  return <section className="bundle-agent" aria-label="資料の処理ジョブ">
    <h3>資料の処理ジョブ</h3><p>Bundle内資料の要約・比較を成果物候補にします。外部検索は未対応です。</p>
    {!supported ? <p>AgentジョブはBigQueryモードで利用できます。</p> : <>
      <button type="button" disabled={draft.busy} onClick={() => void load()}>ジョブと接続状態を取得</button>
      {draft.availability && <p>AI：{draft.availability.enabled ? `${draft.availability.provider} / ${draft.availability.model}` : '停止中（ジョブの登録・閲覧・成果物確認は可能）'}</p>}
      <fieldset disabled={draft.busy || !!draft.running}><legend>新しいジョブ</legend>
        <label>処理<select value={draft.kind} onChange={e => { draft.kind = e.target.value as AgentKind; draft.confirmed = false; draft.jobId = crypto.randomUUID(); notify(); }}>{Object.entries(AGENT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
        <label>追加の依頼（任意）<textarea maxLength={2000} value={draft.instruction} onChange={e => { draft.instruction = e.target.value; draft.confirmed = false; draft.jobId = crypto.randomUUID(); notify(); }} /></label>
        <button type="button" onClick={() => void prepare()}>ジョブの資料を取得</button>
        {draft.context && <><p>資料 {draft.context.sources.length}件 · 取得：{draft.context.capturedAt} · {draft.context.quality === 'partial' ? '不足・未確認あり' : '取得時点の資料'}</p>
          <details><summary>登録する資料本文・手動記録を確認</summary><pre>{JSON.stringify(draft.context, null, 2)}</pre></details></>}
        <label><input type="checkbox" checked={draft.confirmed} disabled={!draft.context} onChange={e => { draft.confirmed = e.target.checked; notify(); }} />この資料範囲と依頼でジョブを登録します</label>
        <button type="button" disabled={!draft.confirmed || !draft.context?.sources.length} onClick={() => void create()}>ジョブを登録</button>
      </fieldset>
      {draft.busy && <p role="status">保存先・資料を確認しています…</p>}{draft.message && <p role="status">{draft.message}</p>}
      {jobs.map(job => <article key={job.id}>
        <h4>{AGENT_KINDS[job.kind]} · {draft.running === job.id ? '実行要求中' : AGENT_STATUS[job.status]}{job.applied ? ' · Thinkへ追加済み' : ''}</h4>
        <p>登録：{job.createdAt} ／ 実行回数：{job.attempts.length} ／ 依頼：{job.instruction || '標準の依頼'}</p>
        {job.status === 'running' && <p>実行期限：{job.leaseUntil}。期限切れ後は再実行できます。状態は取得時点のものです。</p>}
        <details><summary>保存済みの送信範囲・実行履歴</summary><p>再実行も登録時の資料だけを使います。会話履歴・外部資料は送りません。</p><pre>{JSON.stringify({ context: job.context, attempts: job.attempts }, null, 2)}</pre></details>
        {job.status !== 'succeeded' && <>
          <label><input type="checkbox" checked={draft.approvals.has(job.id)} disabled={!!draft.running || draft.busy} onChange={e => { if (e.target.checked) draft.approvals.add(job.id); else draft.approvals.delete(job.id); notify(); }} />保存済みの資料をAIへ送信して{job.status === 'queued' ? '実行' : '再実行'}します（再実行はAIを再度呼び出します）</label>
          <button type="button" disabled={!draft.availability?.enabled || !draft.approvals.has(job.id) || !!draft.running || draft.busy || (job.status === 'running' && Date.parse(job.leaseUntil!) > Date.now())} onClick={() => void run(job)}>ジョブを{job.status === 'queued' ? '実行' : '再実行'}</button>
        </>}
        {(job.status === 'queued' || job.status === 'running' || draft.running === job.id) && <button type="button" disabled={draft.busy} onClick={() => void cancel(job)}>このジョブを中断</button>}
        {job.result && <>
          <p>{job.result.insufficientEvidence ? '根拠不足・未確認を含む成果物候補です。' : '成果物候補を確認してください。'}</p>
          <details><summary>新規Thinkへの追加内容（既存Thinkへの変更なし）</summary><pre>{`# ${artifactFor(job).title}\n${artifactFor(job).body}`}</pre></details>
          <button type="button" onClick={() => download(`${job.id}.md`, `# ${artifactFor(job).title}\n${artifactFor(job).body}`, 'text/markdown')}>Markdownで保存</button>{' '}
          {job.applied ? <button type="button" onClick={() => void open(job)}>追加したThinkを開く</button> : <>
            <label><input type="checkbox" checked={draft.approvals.has(job.id)} disabled={draft.busy || !!draft.running} onChange={e => { if (e.target.checked) draft.approvals.add(job.id); else draft.approvals.delete(job.id); notify(); }} />追加内容と根拠を確認し、新しいThinkとして保存します</label>
            <button type="button" disabled={!draft.approvals.has(job.id) || draft.busy || !!draft.running} onClick={() => void apply(job)}>成果物を新しいThinkへ追加</button>
          </>}
        </>}
        <button type="button" onClick={() => download(`${job.id}.json`, JSON.stringify(job, null, 2), 'application/json')}>ジョブをJSONで書き出す</button>
      </article>)}
    </>}
  </section>;
}
