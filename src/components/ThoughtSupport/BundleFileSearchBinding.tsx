import { useReducer } from 'react';
import type { TTVault } from '../../models/TTVault';
import { StorageManager } from '../../services/storage/StorageManager';
import { FileSearchClient } from '../../services/FileSearchClient';
import { latestBinding, type BindingState } from '../../../server/services/fileSearchBindingRecord';
import { storeName, type FileSearchPage, type FileSearchStatus } from '../../../server/services/fileSearchRecord';

interface Draft {
  connectionId: string; target: string; action: 'link' | 'unlink'; confirmed: boolean; busy: boolean;
  operationId: string; state?: BindingState; message: string; dirty: boolean;
}
const drafts = new WeakMap<TTVault, Map<string, Draft>>(); const client = new FileSearchClient();
function getDraft(vault: TTVault, bundleId: string): Draft {
  let map = drafts.get(vault);
  if (!map) {
    map = new Map(); drafts.set(vault, map); const records = map;
    window.addEventListener('beforeunload', e => { if ([...records.values()].some(d => d.dirty || d.busy)) { e.preventDefault(); e.returnValue = ''; } });
  }
  let draft = map.get(bundleId);
  if (!draft) { draft = { connectionId: '', target: '', action: 'link', confirmed: false, busy: false, operationId: crypto.randomUUID(), message: '', dirty: false }; map.set(bundleId, draft); }
  return draft;
}
export function BundleFileSearchBinding({ vault, bundleId, status, page }: { vault: TTVault; bundleId: string; status?: FileSearchStatus; page?: FileSearchPage }) {
  const [, render] = useReducer(n => n + 1, 0); const draft = getDraft(vault, bundleId);
  const connectionId = draft.connectionId || status?.connectionId || '';
  const saved = draft.state && latestBinding(draft.state.log, vault.ID, connectionId);
  const currentName = saved?.input.storeName ?? null;
  const supported = StorageManager.instance.mode === 'pwa';
  const connectionIds = [...new Set([status?.connectionId, ...(draft.state?.log.events.filter(e => e.input.vaultId === vault.ID).map(e => e.input.connectionId) ?? [])].filter((id): id is string => !!id))];
  const available = status?.enabled && status.connectionId === connectionId;
  function change() { draft.connectionId = connectionId; draft.confirmed = false; draft.operationId = crypto.randomUUID(); draft.dirty = true; render(); }
  async function run(work: () => Promise<void>) {
    if (draft.busy) return; draft.busy = true; draft.message = ''; render();
    try { await work(); } catch (e) { draft.message = e instanceof Error ? e.message : '処理できませんでした。'; }
    finally { draft.busy = false; render(); }
  }
  async function load() {
    await run(async () => {
      draft.state = await client.readBinding(bundleId); draft.confirmed = false; draft.operationId = crypto.randomUUID();
      if (!draft.connectionId) draft.connectionId = status?.connectionId ?? '';
      draft.message = '登録済み対応を取得しました。保存する変更内容を確認してください。';
    });
  }
  async function save() {
    if (!draft.state || !draft.confirmed || !supported || !connectionId || (draft.action === 'link' && (!available || !storeName(draft.target)))) return;
    await run(async () => {
      draft.state = await client.saveBinding(bundleId, draft.state!.version, draft.operationId, {
        vaultId: vault.ID, connectionId, storeName: draft.action === 'unlink' ? null : draft.target, previousStoreName: currentName,
      });
      draft.confirmed = false; draft.dirty = false; draft.operationId = crypto.randomUUID();
      draft.message = draft.action === 'unlink' ? 'このBundleのストア対応を解除しました。外部ストアと資料は残っています。' : 'ストアへのアクセスを確認し、対応を保存しました。資料の同期はまだ行っていません。';
    });
  }
  function download() {
    const data = { schemaVersion: 1, kind: 'thinktank-file-search-binding-backup', vaultId: vault.ID, bundleId,
      exportedAt: new Date().toISOString(), log: { schemaVersion: 1, events: draft.state!.log.events.filter(e => e.input.vaultId === vault.ID) } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); const link = document.createElement('a');
    link.href = url; link.download = `file-search-binding-${bundleId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section aria-label="BundleのFile Search保存先">
    <h4>このBundleの資料保存先</h4>
    <p>接続ごとに1つの既存ストアを登録します。保存時にストアIDへのアクセスを再確認します。資料の送信・外部削除は行いません。</p>
    {!supported && <p>ストア対応の保存はBigQueryモードで利用できます。</p>}
    <button disabled={draft.busy || !supported} onClick={() => void load()}>登録済みのストア対応を取得</button>
    <fieldset disabled={draft.busy || !supported}>
      <legend>保存する変更</legend>
      <label>接続ID<select value={connectionId} onChange={e => { draft.connectionId = e.target.value; draft.target = ''; draft.confirmed = false; draft.operationId = crypto.randomUUID(); draft.dirty = true; render(); }}>
        <option value="">接続を選択してください</option>{connectionIds.map(id => <option key={id} value={id}>{id}</option>)}
      </select></label>
      <p>登録中のストア：{!draft.state ? '未取得' : currentName ?? '未登録・解除済み'}<br />前回のアクセス確認：{saved?.verification?.checkedAt ?? '未確認'}</p>
      {currentName && <p>前回の表示名：{saved?.verification?.stores[0].displayName || currentName}。表示名は変わる場合があります。</p>}
      <label>操作<select value={draft.action} onChange={e => { draft.action = e.target.value as 'link' | 'unlink'; change(); }}>
        <option value="link">登録・変更する</option><option value="unlink">このBundleとの対応を解除する</option>
      </select></label>
      {draft.action === 'link' && <>
        {page?.connectionId === connectionId && <label>取得した一覧から選ぶ<select value={page.stores.some(s => s.name === draft.target) ? draft.target : ''}
          onChange={e => { draft.target = e.target.value; change(); }}><option value="">ストアを選択してください</option>
          {page.stores.map(s => <option key={s.name} value={s.name}>{s.displayName || s.name}（{s.name}）</option>)}
        </select></label>}
        <label>登録するストアID<input value={draft.target} placeholder="fileSearchStores/…" maxLength={100} onChange={e => { draft.target = e.target.value.trim(); change(); }} /></label>
        {!available && <p>この接続で登録するには、サーバーのFile Search設定を有効にして取得してください。</p>}
      </>}
      <p>変更前：{!draft.state ? '未取得' : currentName ?? '未登録'} → 変更後：{draft.action === 'unlink' ? '対応なし（外部ストアは保持）' : draft.target || '未選択'}</p>
      <label><input type="checkbox" checked={draft.confirmed} onChange={e => { draft.confirmed = e.target.checked; render(); }} />このBundle・接続ID・変更前後の対応を確認しました</label>
      <button disabled={!draft.state || !draft.confirmed || !connectionId || (draft.action === 'unlink' ? !currentName : !available || !storeName(draft.target))} onClick={() => void save()}>ストア対応を保存</button>
    </fieldset>
    {draft.state && <details><summary>ストア対応の変更履歴</summary><button onClick={download}>ストア対応の履歴JSONを保存</button>
      {draft.state.log.events.filter(e => e.input.vaultId === vault.ID).slice().reverse().map(e => <p key={e.id}>{e.recordedAt} ／ {e.input.connectionId} ／ {e.input.previousStoreName ?? '未登録'} → {e.input.storeName ?? '解除'}（資料同期の記録ではありません）</p>)}
    </details>}
    {draft.message && <p role="status">{draft.message}</p>}
  </section>;
}
