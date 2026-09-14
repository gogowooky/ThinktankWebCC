import { useReducer } from 'react';
import type { TTVault } from '../../models/TTVault';
import { ContextService } from '../../services/ContextService';
import { ExternalService, prepareExport, type ExternalState } from '../../services/ExternalService';
import { exportDiff, latestConnection, notebookUrl } from '../../../server/services/externalRecord';
import { StorageManager } from '../../services/storage/StorageManager';
import { createExternalBackup, parseExternalBackup, MAX_EXTERNAL_BACKUP_BYTES, type ImportedExternalData } from '../../services/externalBackup';
import type { ExportManifest, ExternalInput } from '../../../server/services/externalRecord';
import './BundleExternal.css';

interface Draft {
  account: string; url: string; state?: ExternalState; prepared?: Awaited<ReturnType<typeof prepareExport>>;
  confirmed: boolean; busy: boolean; message: string; operationId: string; dirty: boolean;
  imported?: ImportedExternalData; restoredManifest?: ExportManifest | null;
}
const drafts = new WeakMap<TTVault, Map<string, Draft>>();
const client = new ExternalService();
function draftFor(vault: TTVault, bundleId: string) {
  let map = drafts.get(vault);
  if (!map) {
    map = new Map(); drafts.set(vault, map); const records = map;
    window.addEventListener('beforeunload', e => {
      if ([...records.values()].some(d => d.busy || d.dirty)) { e.preventDefault(); e.returnValue = ''; }
    });
  }
  let draft = map.get(bundleId);
  if (!draft) { draft = { account: '', url: '', confirmed: false, busy: false, message: '', operationId: crypto.randomUUID(), dirty: false }; map.set(bundleId, draft); }
  return draft;
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BundleExternal({ vault, bundleId }: { vault: TTVault; bundleId: string }) {
  const [, render] = useReducer(n => n + 1, 0); const draft = draftFor(vault, bundleId);
  const supported = StorageManager.instance.mode === 'pwa';
  const previous = draft.state && latestConnection(draft.state.log, vault.ID, draft.account.trim());
  let targetUrl = '';
  try { targetUrl = notebookUrl(draft.url.trim()); } catch { /* Validate incomplete input on explicit save. */ }
  const sameTarget = previous?.notebookUrl === targetUrl;
  const diff = draft.prepared && exportDiff(draft.prepared.manifest, sameTarget ? previous?.manifest ?? null : null);
  function change() { draft.confirmed = false; draft.operationId = crypto.randomUUID(); draft.dirty = true; render(); }
  async function action(work: () => Promise<void>) {
    if (draft.busy) return;
    draft.busy = true; draft.message = ''; render();
    try { await work(); } catch (e) { draft.message = e instanceof Error ? e.message : '処理できませんでした。'; }
    finally { draft.busy = false; render(); }
  }
  async function load() {
    await action(async () => {
      draft.state = await client.read(bundleId); draft.confirmed = false;
      draft.message = '登録済み記録を取得しました。入力と登録先を比較して確認してください。';
    });
  }
  async function prepare() {
    await action(async () => {
      draft.confirmed = false; draft.prepared = undefined; draft.restoredManifest = undefined; draft.operationId = crypto.randomUUID();
      draft.prepared = await prepareExport(await new ContextService(vault).getBundleContext(bundleId));
      change(); draft.message = '取得時点の資料です。本文と注意事項を確認して書き出してください。';
    });
  }
  async function save() {
    if (!supported || !draft.state || !draft.confirmed) return;
    await action(async () => {
      const target = notebookUrl(draft.url.trim());
      draft.state = await client.save(bundleId, draft.state!.version, draft.operationId, {
        vaultId: vault.ID, accountKey: draft.account.trim(), provider: 'notebooklm-manual', notebookUrl: target,
        manifest: draft.restoredManifest !== undefined ? draft.restoredManifest : draft.prepared?.manifest ?? (previous?.notebookUrl === target ? previous.manifest : null),
      });
      draft.url = target; draft.account = draft.account.trim(); draft.confirmed = false; draft.dirty = false;
      draft.operationId = crypto.randomUUID(); draft.message = '手動連携の記録を保存しました。外部へのアップロード・同期は未確認です。';
    });
  }
  async function importFile(file: File) {
    await action(async () => {
      draft.imported = undefined; draft.restoredManifest = undefined; change();
      if (file.size > MAX_EXTERNAL_BACKUP_BYTES) throw new Error('JSONが容量上限を超えています。');
      draft.imported = parseExternalBackup(await file.text(), vault.ID, bundleId);
      draft.message = 'ファイルを読み込みました。保存する候補を選び、登録先と記録を確認してください。本文の復元・外部同期は行いません。';
    });
  }
  function selectRecovery(manifest: ExportManifest | null, input?: ExternalInput) {
    if (input) { draft.account = input.accountKey; draft.url = input.notebookUrl; }
    draft.restoredManifest = manifest; change();
    draft.message = '復元候補を入力しました。登録済み記録を取得し、確認後に保存すると新しい履歴として追記されます。';
  }
  const recoveryDiff = draft.restoredManifest && draft.prepared && exportDiff(draft.prepared.manifest, draft.restoredManifest);
  return <section className="bundle-external" aria-label="外部資料連携">
    <h3>外部資料連携 — NotebookLMへ手動で渡す</h3>
    <p>Bundleの資料を取得し、Markdownを保存してNotebookLMへ手動で追加できます。自動送信はありません。</p>
    <p>この欄は手動連携です。Gemini File Searchの接続確認は下の専用欄で行えます。書き出し記録は同期完了を意味しません。</p>
    {!supported && <p>この保存方式ではリンク履歴を保存できません。資料の書き出しは利用できます。</p>}
    <button disabled={draft.busy || !supported} onClick={() => void load()}>登録済み連携を取得</button>{' '}
    <button disabled={draft.busy} onClick={() => void prepare()}>書き出す資料を取得</button>
    <fieldset disabled={draft.busy}>
      <legend>手動の連携先</legend>
      <label>アカウント識別名（英数字・ハイフン・下線、例 work。認証情報は入力しない）
        <input value={draft.account} onChange={e => { draft.account = e.target.value; change(); }} maxLength={200} /></label>
      <label>NotebookLMのノートブックURL
        <input type="url" value={draft.url} onChange={e => { draft.url = e.target.value; change(); }} maxLength={1000} /></label>
      {previous && <p>この識別名の登録先：<a href={previous.notebookUrl} target="_blank" rel="noopener noreferrer">{previous.notebookUrl}</a><br />
        前回の準備日時：{previous.manifest?.capturedAt ?? '資料の記録なし'}。外部同期：未確認。
        {!sameTarget && ' 登録先を変更する場合、以前の対応は履歴に残り、新しい対象として保存します。'}</p>}
      {draft.state && <details><summary>登録履歴（{draft.state.log.events.filter(e => e.input.vaultId === vault.ID).length}件）</summary>
        <button onClick={() => download(`external-history-${bundleId}.json`, JSON.stringify(createExternalBackup(draft.state!.log, vault.ID, bundleId)), 'application/json')}>履歴JSONを保存</button>
        {draft.state.log.events.filter(e => e.input.vaultId === vault.ID).slice().reverse().map(e => <p key={e.id}>{e.recordedAt} · {e.input.accountKey} · {e.input.notebookUrl}
          <button onClick={() => { draft.account = e.input.accountKey; draft.url = e.input.notebookUrl; change(); }}>この登録先を入力</button></p>)}</details>}
      <label><input type="checkbox" checked={draft.confirmed} onChange={e => { draft.confirmed = e.target.checked; render(); }} />
        連携先と準備・復元記録を確認し、手動連携の記録として保存する（外部同期は未確認）</label>
      <button disabled={!supported || !draft.state || !draft.confirmed || !draft.account.trim() || !draft.url.trim()} onClick={() => void save()}>連携先と準備記録を保存</button>
    </fieldset>
    <fieldset disabled={draft.busy}>
      <legend>対応表・連携履歴から再登録する</legend>
      <label>このVault・Bundleから書き出したJSON
        <input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importFile(file); }} /></label>
      <p>JSONは登録候補として読み込みます。外部の実在・所有者・同期状態は確認できません。元のThink本文は含まれていません。</p>
      {draft.imported?.kind === 'manifest' && <div><p>対応表：{draft.imported.manifest.capturedAt} ／ {draft.imported.manifest.sources.length}件</p>
        <button onClick={() => { if (draft.imported?.kind === 'manifest') selectRecovery(draft.imported.manifest); }}>この対応表を復元候補にする</button></div>}
      {draft.imported?.kind === 'history' && <div><p>履歴：{draft.imported.backup.log.events.length}件。選んだ1件を新しい履歴として追記します。</p>
        {draft.imported.backup.log.events.slice().reverse().map(e => <article key={e.id}>
          <p>{e.recordedAt} ／ {e.input.accountKey} ／ {e.input.notebookUrl} ／ 資料 {e.input.manifest?.sources.length ?? 0}件</p>
          <button onClick={() => selectRecovery(e.input.manifest, e.input)}>この履歴を復元候補にする</button>
        </article>)}</div>}
      {draft.restoredManifest !== undefined && <div>
        <p>保存する復元候補：{draft.restoredManifest ? `${draft.restoredManifest.capturedAt} の準備記録（${draft.restoredManifest.sources.length}件）` : '連携先のみ・資料対応なし'}。外部同期は未確認です。</p>
        {draft.restoredManifest?.issues.map((issue, index) => <p key={index}>{issue}</p>)}
        <ul>{draft.restoredManifest?.sources.map(source => <li key={source.thinkId}>{source.title || source.thinkId} ／ {source.thinkId}
          <small>SHA-256: {source.contentHash} ／ {vault.GetThink(source.thinkId) ? 'Vault一覧に同じIDあり' : 'Vault一覧に同じIDなし'}{source.hasUnsavedChanges ? ' ／ 取得時に未保存編集あり' : ''}</small></li>)}</ul>
        {recoveryDiff ? <p>画面で準備済みの資料との比較：追加 {recoveryDiff.sources.filter(s => s.change === 'added').length}件、変更 {recoveryDiff.sources.filter(s => s.change === 'updated').length}件、
          同じ本文 {recoveryDiff.sources.filter(s => s.change === 'unchanged').length}件、今回取得できない資料 {recoveryDiff.missing.length}件。取得日時：{draft.prepared!.manifest.capturedAt}</p>
          : <p>現在のBundle資料との照合は未実施です。照合するには先に「書き出す資料を取得」し、再度この復元候補を選択してください。</p>}
        <button onClick={() => { draft.restoredManifest = undefined; change(); }}>復元候補の選択を解除</button>
      </div>}
    </fieldset>
    {draft.prepared && diff && <div>
      <p>取得日時：{draft.prepared.manifest.capturedAt} ／ {draft.prepared.manifest.quality === 'partial' ? '一部資料に不確実性あり' : '解決できた資料範囲'} ／ {diff.sources.length}件</p>
      <p>比較対象は同じ登録先の前回準備記録です。外部での変更・欠落・重複は検出していません。</p>
      {draft.prepared.manifest.issues.map((issue, index) => <p role="note" key={index}>{issue}</p>)}
      <button onClick={() => download(`manifest-${draft.prepared!.manifest.snapshotId}.json`, JSON.stringify(draft.prepared!.manifest, null, 2), 'application/json')}>対応表JSONを保存</button>
      <p>対応表は手元に保管し、下のMarkdownを必要な資料ごとに保存して追加してください。外部Source IDは未取得です。</p>
      <ul>{diff.sources.map((source, index) => <li key={source.thinkId}>
        <strong>{source.title || source.thinkId}</strong> — {{ added: '新規', updated: '変更あり', unchanged: '変更なし' }[source.change]}
        {source.hasUnsavedChanges && <span> ／ 未保存の編集を含む</span>}
        <details><summary>本文と出典を確認</summary><p>{source.thinkId} ／ SHA-256: {source.contentHash}</p><pre>{draft.prepared!.files[index].content}</pre></details>
        <button onClick={() => download(source.filename, draft.prepared!.files[index].content, 'text/markdown;charset=utf-8')}>Markdownを保存：{source.thinkId}</button>
      </li>)}</ul>
      {diff.missing.length > 0 && <p>今回取得できない資料（範囲変更・読込失敗など。外部から削除しません）：{diff.missing.map(s => s.thinkId).join('、')}</p>}
    </div>}
    {draft.message && <p role="status">{draft.message}</p>}
  </section>;
}
