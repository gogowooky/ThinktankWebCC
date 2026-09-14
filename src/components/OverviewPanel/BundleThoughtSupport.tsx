import { useEffect, useReducer, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import type { ContextSnapshot } from '../../services/contextTypes';
import { ContextService } from '../../services/ContextService';
import { StorageManager } from '../../services/storage/StorageManager';
import type { ThinkMeta } from '../../services/storage/IStorageBackend';
import { ThinkSupportService, THINK_FIELDS, emptyThinkValues, readThinkSupport, type ThinkValues, type ThinkSources } from '../../services/ThinkSupportService';
import { ContextSnapshotView, CONTEXT_LABELS } from './ContextSnapshotView';
import { useAppUpdate } from '../../hooks/useAppUpdate';

interface Draft { values: ThinkValues; sources: ThinkSources; base: ThinkMeta; dirty: boolean; confirmed: boolean; busy: boolean; message: string; remote?: ThinkMeta }
// Drafts survive Overview/tab/Bundle switches for this Vault's lifetime. They never cross Vaults.
const drafts = new WeakMap<TTVault, Map<string, Draft>>();
function draftMap(vault: TTVault) {
  let map = drafts.get(vault);
  if (!map) {
    map = new Map(); drafts.set(vault, map);
    const savedMap = map;
    // Keep the warning active even when Overview is hidden while a draft exists.
    window.addEventListener('beforeunload', event => {
      if ([...savedMap.values()].some(d => d.dirty || d.busy)) { event.preventDefault(); event.returnValue = ''; }
    });
  }
  return map;
}
function fromMeta(base: ThinkMeta): Draft {
  const record = readThinkSupport(base.metadata?.thinkSupport);
  return { values: { ...(record?.values ?? emptyThinkValues()) }, sources: { ...record?.sources }, base, dirty: false, confirmed: false, busy: false, message: '', remote: undefined };
}
const service = new ThinkSupportService();

export function BundleThoughtSupport({ vault, bundleId, onOpen }: { vault: TTVault; bundleId: string; onOpen: (id: string) => void }) {
  useAppUpdate(vault);
  const [, render] = useReducer(n => n + 1, 0);
  const [retry, setRetry] = useState(0);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [error, setError] = useState('');
  const [contextError, setContextError] = useState('');
  const map = draftMap(vault);
  const draft = map.get(bundleId);
  const supported = StorageManager.instance.mode === 'pwa';
  const snapshot = context?.bundleId === bundleId && context.vaultId === vault.ID ? context : null;
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setContext(null); setError(''); setContextError('');
    void new ContextService(vault).getBundleContext(bundleId, { signal: abort.signal }).then(value => {
      if (active) setContext(value);
    }).catch(e => { if (active) setContextError(e instanceof Error ? e.message : '資料の取得に失敗しました。'); });
    if (supported && !map.has(bundleId)) {
      void service.read(bundleId).then(meta => { if (active) { map.set(bundleId, fromMeta(meta)); render(); } })
        .catch(e => { if (active) setError(e.message); });
    }
    return () => { active = false; abort.abort(); };
  }, [vault, bundleId, retry, supported, map]);
  function change(update: Partial<Draft>) {
    if (!draft || draft.busy) return;
    Object.assign(draft, update, { dirty: true, confirmed: false, message: '' }); render();
  }
  async function checkLatest() {
    if (!draft || draft.busy) return;
    draft.busy = true; render();
    try { draft.remote = await service.read(bundleId); draft.message = '最新の保存内容を表示しました。入力との差を確認してください。'; }
    catch (e) { draft.message = (e as Error).message; }
    finally { draft.busy = false; render(); vault.NotifyUpdated(false); }
  }
  async function save() {
    if (!draft || draft.busy || !draft.confirmed) return;
    draft.busy = true; draft.message = ''; render();
    try {
      const meta = await service.save(bundleId, draft.base.updatedAt, draft.values, draft.sources);
      // Merge only the saved P2 area into the live object; preserve any concurrent local edits.
      const live = vault.GetThink(bundleId);
      if (live) {
        const metadataWasDirty = live.IsMetadataDirty;
        live.Metadata = { ...live.Metadata, thinkSupport: meta.metadata?.thinkSupport };
        if (!metadataWasDirty) live.markMetadataSaved();
        // Only advance the full-record version when the client already held the saved base.
        if (live.UpdatedAt === draft.base.updatedAt) live.UpdatedAt = meta.updatedAt;
        vault.NotifyUpdated(false);
      }
      Object.assign(draft, fromMeta(meta), { message: '手動記録を保存しました。' });
      setRetry(n => n + 1);
    } catch (e) {
      draft.message = (e as Error).name === 'StorageConflictError'
        ? '保存競合：別の更新があります。入力を保持しています。「最新の保存内容を確認」から比較してください。'
        : (e as Error).message;
      draft.confirmed = false;
    } finally { draft.busy = false; render(); vault.NotifyUpdated(false); }
  }
  const remoteRecord = draft?.remote ? readThinkSupport(draft.remote.metadata?.thinkSupport) : null;
  return <section className="bundle-thought-support" aria-label="手動の思考状態">
    <h3>課題の概要</h3>
    <p>手動で記録するBundle全体の思考状態です。空欄は未記録です。</p>
    {!supported && <p>手動保存はBigQueryモードで利用できます。この保存先では参照資料を閲覧できます。</p>}
    {!supported && snapshot?.manualState && <dl>{THINK_FIELDS.map(field => <div key={field}><dt>{CONTEXT_LABELS[field]}</dt><dd>{snapshot.manualState?.values[field] || '未記録'}</dd></div>)}</dl>}
    {error && <p role="alert">{error}</p>}
    {supported && !draft && !error && <p role="status">保存内容を読み込んでいます…</p>}
    {draft && <>
      <p>保存版：{readThinkSupport(draft.base.metadata?.thinkSupport)?.revision ?? '未記録'} · 本人確認：{readThinkSupport(draft.base.metadata?.thinkSupport)?.confirmedAt ?? '未確認'}</p>
      {draft.dirty && <p role="status">未保存の入力があります。画面切替後もこのセッション内で保持します。</p>}
      <fieldset disabled={draft.busy}>
        <legend>手動入力</legend>
        {THINK_FIELDS.map(field => <div key={field} className="thinking-field">
          <label>{CONTEXT_LABELS[field]}<textarea value={draft.values[field]} maxLength={10000}
            onChange={e => change({ values: { ...draft.values, [field]: e.target.value } })} /></label>
          <label>出典（任意）<select value={draft.sources[field]?.thinkId ?? ''} onChange={e => {
            const sources = { ...draft.sources }; const selected = snapshot?.sources.find(s => s.thinkId === e.target.value);
            if (selected) sources[field] = { thinkId: selected.thinkId, contentHash: selected.contentHash }; else delete sources[field];
            change({ sources });
          }}>
            <option value="">本人の記述・出典なし</option>
            {draft.sources[field] && !snapshot?.sources.some(s => s.thinkId === draft.sources[field]?.thinkId) &&
              <option value={draft.sources[field]?.thinkId}>保存済み出典：{draft.sources[field]?.thinkId}</option>}
            {snapshot?.sources.map(s => <option key={s.thinkId} value={s.thinkId}>{s.title || s.thinkId}</option>)}
          </select></label>
          {draft.sources[field] && <button type="button" onClick={() => onOpen(draft.sources[field]!.thinkId)}>出典を開く</button>}
          {draft.sources[field] && snapshot?.sources.some(s => s.thinkId === draft.sources[field]?.thinkId && s.contentHash !== draft.sources[field]?.contentHash) &&
            <p>出典は記録時から変更されています。内容を確認し、必要なら出典を選び直してください。</p>}
        </div>)}
        <label><input type="checkbox" checked={draft.confirmed} onChange={e => { draft.confirmed = e.target.checked; render(); }} />この内容を自分の手動記録として確認しました</label>
        <p><button type="button" disabled={!draft.dirty || !draft.confirmed || !!draft.remote} onClick={() => void save()}>思考状態を保存</button>{' '}
          <button type="button" onClick={() => void checkLatest()}>最新の保存内容を確認</button></p>
      </fieldset>
      {draft.busy && <p role="status">保存先に問い合わせています…</p>}
      {draft.message && <p role="status">{draft.message}</p>}
      {draft.remote && <section aria-label="保存内容との比較">
        <h4>最新の保存内容（入力は保持中）</h4>
        <p>本人確認：{remoteRecord?.confirmedAt || '未確認'}</p>
        {THINK_FIELDS.map(field => <div key={field}><strong>{CONTEXT_LABELS[field]}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{remoteRecord?.values[field] || '未記録'}</p>
          {remoteRecord?.sources[field] && <p>保存済み出典：<button type="button" onClick={() => onOpen(remoteRecord.sources[field]!.thinkId)}>{remoteRecord.sources[field]!.thinkId}</button><br />本文ハッシュ：<code>{remoteRecord.sources[field]!.contentHash}</code></p>}
        </div>)}
        <button disabled={draft.busy} onClick={() => { draft.base = draft.remote!; draft.remote = undefined; draft.confirmed = false; draft.dirty = true; render(); }}>比較を終え、現在の入力で再確認する</button>{' '}
        <button disabled={draft.busy} onClick={() => { Object.assign(draft, fromMeta(draft.remote!)); render(); }}>入力を破棄し、保存内容を採用</button>
      </section>}
    </>}
    <button type="button" onClick={() => setRetry(n => n + 1)}>参照資料を再取得</button>
    {contextError && <p role="alert">{contextError}</p>}
    {snapshot && <ContextSnapshotView snapshot={snapshot} onOpen={onOpen} />}
  </section>;
}
