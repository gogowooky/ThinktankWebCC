/**
 * AiWorkVersionsDialog.tsx
 * AIWork の版（スナップショットと現在の内容）から2つを選んで差分を表示し、選んだ版へ戻す。
 */

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { TTThink } from '../../models/TTThink';
import type { TTVault } from '../../models/TTVault';
import type { ThinkSnapshotRecord } from '../../services/storage/StorageManager';
import { listAiWorkVersions, restoreAiWorkVersion, snapshotContent } from '../../services/harness/aiWorkVersions';
import { diffLines } from '../../utils/lineDiff';
import './AiWorkVersionsDialog.css';

const CURRENT = 'current';

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface Props {
  aiWork: TTThink;
  vault: TTVault;
  onClose: () => void;
}

export function AiWorkVersionsDialog({ aiWork, vault, onClose }: Props) {
  const [versions, setVersions] = useState<ThinkSnapshotRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>(CURRENT);
  const [restoring, setRestoring] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        if (aiWork.IsMetaOnly) await aiWork.LoadContent();
        const list = await listAiWorkVersions(aiWork);
        if (cancelled) return;
        setVersions(list);
        setFrom(list.length ? String(list.length - 1) : CURRENT);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [aiWork, reloadKey]);

  const contentOf = (key: string): string | null => {
    if (key === CURRENT) return aiWork.Content;
    const version = versions?.[Number(key)];
    return version ? snapshotContent(version) : null;
  };
  const fromContent = contentOf(from);
  const toContent = contentOf(to);
  const diff = useMemo(
    () => (fromContent !== null && toContent !== null ? diffLines(fromContent, toContent) : null),
    [fromContent, toContent],
  );

  const options = [
    ...(versions ?? []).map((v, i) => ({ key: String(i), label: `${formatAt(v.snapshotAt)} の版` })),
    { key: CURRENT, label: '現在の内容' },
  ];

  const handleRestore = async () => {
    const version = from === CURRENT ? null : versions?.[Number(from)];
    if (!version || restoring) return;
    if (!window.confirm(`「${aiWork.Name}」を ${formatAt(version.snapshotAt)} の版に戻します。現在の内容は版として残ります。`)) return;
    setRestoring(true);
    try {
      await restoreAiWorkVersion(vault, aiWork, version);
      setTo(CURRENT);
      setReloadKey(n => n + 1);
    } catch (e) {
      setError(`戻せませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRestoring(false);
    }
  };

  let body: React.ReactNode;
  if (error) body = <div className="aiwork-versions__message aiwork-versions__message--error" role="alert">{error}</div>;
  else if (!versions) body = <div className="aiwork-versions__message">読み込み中…</div>;
  else if (versions.length === 0) body = <div className="aiwork-versions__message">保存された版はまだありません。AI が書き換える直前に自動で残ります。</div>;
  else if (!diff || !diff.changed) body = <div className="aiwork-versions__message">差分はありません。</div>;
  else {
    body = (
      <pre className="aiwork-versions__diff" aria-label="差分">
        {diff.lines.map((line, i) => (
          <div key={i} className={line.startsWith('+') ? 'aiwork-versions__added' : 'aiwork-versions__removed'}>{line}</div>
        ))}
      </pre>
    );
  }

  return (
    <div className="aiwork-versions__backdrop" onClick={onClose}>
      <div className="aiwork-versions" role="dialog" aria-label="版の比較" onClick={e => e.stopPropagation()}>
        <div className="aiwork-versions__header">
          <span className="aiwork-versions__title">版の比較: {aiWork.Name}</span>
          <button type="button" className="aiwork-versions__close" aria-label="閉じる" onClick={onClose}><X size={12} /></button>
        </div>
        <div className="aiwork-versions__controls">
          <label>
            比較元
            <select value={from} onChange={e => setFrom(e.target.value)} disabled={!versions}>
              {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label>
            比較先
            <select value={to} onChange={e => setTo(e.target.value)} disabled={!versions}>
              {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <button type="button" className="aiwork-versions__restore" onClick={handleRestore}
            disabled={from === CURRENT || restoring || !versions?.length}>
            比較元の版に戻す
          </button>
        </div>
        <div className="aiwork-versions__body">{body}</div>
      </div>
    </div>
  );
}
