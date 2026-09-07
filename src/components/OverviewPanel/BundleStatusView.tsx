import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { MANAGED_STATES, parseManagedChatTitle } from '../../utils/managedChat';
import './BundleStatusView.css';

interface Props { vault: TTVault; bundleId: string; onOpen: (id: string) => void }
export const BundleStatusView = forwardRef<{ focus: () => void }, Props>(function BundleStatusView({ vault, bundleId, onOpen }, ref) {
  useAppUpdate(vault);
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => root.current?.focus() }), []);
  const [result, setResult] = useState<{ id: string; items: TTThink[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const bundle = vault.GetThink(bundleId);
  // Includes nested bundle changes and title/date changes affecting conditional membership.
  const revision = JSON.stringify(vault.GetThinks().map(t => [t.ID, t.Name, t.Keywords, t.UpdatedAt, t.ContentType === 'bundle' ? t.Content : '']));
  useEffect(() => {
    let cancelled = false;
    setError(''); setLoading(true);
    void vault.GetThinksForBundleAsync(bundleId, true).then(items => {
      if (!cancelled) setResult({ id: bundleId, items });
    }).catch(() => { if (!cancelled) setError('状況を読み込めませんでした。再読み込みしてください。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vault, bundleId, revision, retry]);
  const items = result?.id === bundleId ? result.items : [];
  const chats = items.flatMap(think => {
    const info = think.ContentType === 'chat' ? parseManagedChatTitle(think.Name) : null;
    return info ? [{ think, ...info }] : [];
  });
  const resources = items.filter(t => !chats.some(c => c.think.ID === t.ID));
  return <div className="bundle-status" tabIndex={-1} ref={root} aria-busy={loading}>
    <header><p className="bundle-status__eyebrow">この課題の状況</p><h2>{bundle?.Name || 'Bundle'}</h2>
      <p>このBundleに含まれる記録を表示しています。</p>
      <button onClick={() => onOpen(bundleId)}>Bundleの記録を開く</button>{' '}
      <button onClick={() => setRetry(n => n + 1)} disabled={loading}>再読み込み</button>
    </header>
    {error ? <p role="alert">{error}</p> : loading ? <p role="status">記録を確認しています…</p> : <>
      <p className="bundle-status__summary">管理する相談 {chats.length}件 · その他の記録 {resources.length}件</p>
      {chats.length === 0 && <p>管理する相談はまだありません。TODO:Overview｜[未着手]相談名 などのChatをBundleに含めると、ここで確認できます。</p>}
      {[...MANAGED_STATES, '状態未設定'].map(state => {
        const entries = chats.filter(c => c.state === state);
        if (!entries.length) return null;
        return <section key={state}><h3>{state} <small>{entries.length}件</small></h3>
          <ul>{entries.map(c => <li key={c.think.ID}><button onClick={() => onOpen(c.think.ID)}>
            <strong>{c.title || c.think.Name}</strong><span>{c.kind} · 担当：{c.panel}</span>
            <span className="bundle-status__link">記録を開く →</span>
          </button></li>)}</ul>
        </section>;
      })}
      <details><summary>資料・その他の記録（{resources.length}件）</summary><ul>{resources.map(t => <li key={t.ID}>
        <button onClick={() => onOpen(t.ID)}>{t.Name || t.ID}<span>{t.ContentType}</span></button>
      </li>)}</ul></details>
      <p className="bundle-status__note">状態はChatタイトルの記録です。実施結果や本人の確認を表すものではありません。</p>
    </>}
  </div>;
});
