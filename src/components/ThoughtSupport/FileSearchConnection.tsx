import { useEffect, useRef, useState } from 'react';
import { FileSearchClient } from '../../services/FileSearchClient';
import type { FileSearchPage, FileSearchStatus } from '../../../server/services/fileSearchRecord';
import './BundleExternal.css';
const client = new FileSearchClient();
export function FileSearchConnection() {
  const [status, setStatus] = useState<FileSearchStatus>(); const [page, setPage] = useState<FileSearchPage>();
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController>();
  useEffect(() => () => { pending.current?.abort(); pending.current = undefined; }, []);
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setMessage('');
    try { await work(controller.signal); }
    catch (e) { if (pending.current === controller) setMessage(controller.signal.aborted ? '接続確認を中断しました。' : e instanceof Error ? e.message : '取得できません。'); }
    finally { if (pending.current === controller) { pending.current = undefined; setBusy(false); } }
  }
  async function settings() {
    await run(async signal => {
      const result = await client.status(signal);
      if (signal.aborted) return;
      setStatus(result); setPage(undefined); setMessage('サーバーの設定を取得しました。外部接続の成功はまだ確認していません。');
    });
  }
  async function list(next = false) {
    if (!status?.enabled || !status.connectionId) return;
    const connectionId = status.connectionId;
    await run(async signal => {
      const result = await client.listStores(connectionId, next ? page?.nextPageToken ?? '' : '', signal);
      if (signal.aborted) return;
      setPage(result); setMessage('File Searchからストア情報を取得しました。Bundleとの対応・資料同期は未登録です。');
    });
  }
  return <section className="bundle-external" aria-label="Gemini File Search接続確認">
    <h3>Gemini File Search — 接続先の確認</h3>
    <p>この接続で利用できるストアを確認します。NotebookLMのノートブックとは別の保存先です。資料の送信・検索・ストア作成はまだ行いません。</p>
    <button disabled={busy} onClick={() => void settings()}>File Searchの設定を取得</button>{' '}
    <button disabled={busy || !status?.enabled} onClick={() => void list()}>接続先のストア一覧を取得</button>
    {busy && <button onClick={() => pending.current?.abort()}>接続確認を中断</button>}
    {status && <p>{status.enabled ? `接続設定あり：${status.connectionId}（読み取り専用）` : 'File Searchは停止中です。サーバー側の設定が必要です。'}</p>}
    {page && <div><p>確認日時：{page.checkedAt} ／ このページ：{page.stores.length}件。Bundleの資料範囲による絞り込みはありません。</p>
      <ul>{page.stores.map(store => <li key={store.name}><strong>{store.displayName || store.name}</strong><p>{store.name}</p>
        <p>検索可能：{store.activeDocuments ?? '不明'} ／ 処理中：{store.pendingDocuments ?? '不明'} ／ 失敗：{store.failedDocuments ?? '不明'}</p></li>)}</ul>
      {page.nextPageToken ? <button disabled={busy} onClick={() => void list(true)}>次のストアページを取得</button> : <p>最終ページです。このページの結果だけを表示しています。</p>}
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
