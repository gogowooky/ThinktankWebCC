/**
 * src/components/ThinktankPanel/StorageModeSettingsPanel.tsx
 * Thinktank > 設定 > モード切替（PC版のみ）
 * 「Firestore で使う／ローカルで使う」と ThinkファイルFolder を選び、再起動で反映する。
 * Firestore モードのときは ThinkファイルFolder との間で Think を写せる（最新を残す）。
 * 上書き用Thinkファイルフォルダーからは、日付に関わらず Firestore へ上書きコピーできる。
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, FolderSync, CloudDownload, CloudUpload } from 'lucide-react';
import { usePanelSectionsSetAll } from '../../hooks/usePanelSectionsSetAll';
import { StorageManager, type VaultMigrationResult } from '../../services/storage/StorageManager';
import type { ElectronAppModeInfo, ElectronAppModeSetting } from '../../services/storage/ElectronStorageBackend';
import { TTModels } from '../../models/TTModels';
import './StorageModeSettingsPanel.css';

type Message = { kind: 'info' | 'error' | 'done'; text: string };

function describeMigration(result: VaultMigrationResult): string {
  const failed = result.failedIds.length ? `、失敗 ${result.failedIds.length} 件（${result.failedIds.slice(0, 5).join(', ')}${result.failedIds.length > 5 ? ' …' : ''}）` : '';
  return `新規 ${result.created} 件、更新 ${result.updated} 件、変更なし ${result.skipped} 件${failed}`;
}

// 上書き用Thinkファイルフォルダーは端末ごとの作業用の指定なので、localStorage に覚えるだけにする
const OVERWRITE_DIR_KEY = 'tt.storageMode.overwriteDir';

function loadOverwriteDir(): string {
  try { return localStorage.getItem(OVERWRITE_DIR_KEY) ?? ''; } catch { return ''; }
}

function saveOverwriteDir(dir: string): void {
  try { localStorage.setItem(OVERWRITE_DIR_KEY, dir); } catch { /* 覚えられなくても入力欄の値で動く */ }
}

export function StorageModeSettingsPanel() {
  const api = typeof window !== 'undefined' ? window.electronAPI?.appMode : undefined;
  const [isOpen, setIsOpen] = useState(true);
  usePanelSectionsSetAll('thinktank', [setIsOpen]);
  const [info, setInfo] = useState<ElectronAppModeInfo | null>(null);
  const [draft, setDraft] = useState<ElectronAppModeSetting>({ storageMode: 'firestore', localVaultDir: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [overwriteDir, setOverwriteDir] = useState(loadOverwriteDir);

  const updateOverwriteDir = useCallback((dir: string) => {
    setOverwriteDir(dir);
    saveOverwriteDir(dir);
  }, []);

  useEffect(() => {
    if (!api) return;
    void api.get().then((loaded) => {
      setInfo(loaded);
      setDraft(loaded.saved);
      if (loaded.startupProblem) {
        setMessage({ kind: 'error', text: `ローカル運用モードで起動できませんでした: ${loaded.startupProblem}` });
      }
    }).catch((e: unknown) => {
      setMessage({ kind: 'error', text: `モード設定を読めませんでした: ${e instanceof Error ? e.message : String(e)}` });
    });
  }, [api]);

  const handlePickFolder = useCallback(async () => {
    if (!api) return;
    const picked = await api.selectFolder(draft.localVaultDir || undefined);
    if (picked) setDraft((d) => ({ ...d, localVaultDir: picked }));
  }, [api, draft.localVaultDir]);

  const handleApply = useCallback(async () => {
    if (!api) return;
    const label = draft.storageMode === 'local' ? `ローカルで使う（${draft.localVaultDir || '未指定'}）` : 'Firestore で使う';
    if (!window.confirm(`「${label}」に設定して再起動します。よろしいですか？`)) return;
    setBusy(true);
    setMessage({ kind: 'info', text: '編集中の内容を保存しています...' });
    try {
      await window.__ttFlushAllSaves?.();
      const result = await api.apply(draft);
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error });
        setBusy(false);
        return;
      }
      setMessage({ kind: 'info', text: '再起動しています...' });
    } catch (e) {
      setMessage({ kind: 'error', text: `再起動できませんでした: ${e instanceof Error ? e.message : String(e)}` });
      setBusy(false);
    }
  }, [api, draft]);

  const runMigration = useCallback(async (direction: 'toLocal' | 'toFirestore') => {
    const dir = draft.localVaultDir.trim();
    const question = direction === 'toLocal'
      ? `Firestore の Think を ThinkファイルFolder（${dir}）へコピーします。\n同じ Think は更新日時の新しい方を残し、上書きされる版は trash/ に退避します。`
      : `ThinkファイルFolder（${dir}）の Think を Firestore へコピーします。\n同じ Think は更新日時の新しい方を残し、上書きされる Firestore の版は ThinkファイルFolder の trash/ に退避します。`;
    if (!window.confirm(`${question}\n\nよろしいですか？`)) return;
    setBusy(true);
    const progress = (done: number, total: number) => setMessage({ kind: 'info', text: `コピーしています... ${done} / ${total}` });
    setMessage({ kind: 'info', text: '一覧を読み込んでいます...' });
    try {
      const manager = StorageManager.instance;
      const result = direction === 'toLocal'
        ? await manager.copyFirestoreToLocal(dir, progress)
        : await manager.copyLocalToFirestore(dir, progress);
      if (direction === 'toFirestore') await TTModels.Instance?.Vault?.ReloadAll();
      setMessage({
        kind: result.failedIds.length ? 'error' : 'done',
        text: `${direction === 'toLocal' ? 'ThinkファイルFolder' : 'Firestore'} へのコピーが完了しました: ${describeMigration(result)}`,
      });
    } catch (e) {
      setMessage({ kind: 'error', text: `コピーに失敗しました: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }, [draft.localVaultDir]);

  const handlePickOverwriteFolder = useCallback(async () => {
    if (!api) return;
    const picked = await api.selectFolder(overwriteDir || undefined, '上書き用Thinkファイルフォルダーを選択');
    if (picked) updateOverwriteDir(picked);
  }, [api, overwriteDir, updateOverwriteDir]);

  const runOverwrite = useCallback(async () => {
    const dir = overwriteDir.trim();
    const question = `上書き用Thinkファイルフォルダー（${dir}）の Thinkファイルを Firestore へ上書きコピーします。\n`
      + '同じ ID の Think は更新日時に関わらず上書きします（上書きされる Firestore の版は Markdownバックアップ先の trash/ に退避します）。';
    if (!window.confirm(`${question}\n\nよろしいですか？`)) return;
    setBusy(true);
    setMessage({ kind: 'info', text: '編集中の内容を保存しています...' });
    try {
      // 未保存の編集が後から保存されると、上書きした内容を古い版で戻してしまうため先に保存する
      await window.__ttFlushAllSaves?.();
      setMessage({ kind: 'info', text: 'フォルダを読み込んでいます...' });
      const result = await StorageManager.instance.overwriteFolderToFirestore(
        dir,
        (done, total) => setMessage({ kind: 'info', text: `上書きコピーしています... ${done} / ${total}` }),
      );
      await TTModels.Instance?.Vault?.ReloadAll();
      setMessage({
        kind: result.failedIds.length ? 'error' : 'done',
        text: `Firestore への上書きコピーが完了しました: ${describeMigration(result)}`,
      });
    } catch (e) {
      setMessage({ kind: 'error', text: `上書きコピーに失敗しました: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }, [overwriteDir]);

  if (!api) return null;

  const runningLocal = info?.running.storageMode === 'local';
  const changed = Boolean(info) && (
    draft.storageMode !== info?.running.storageMode
    || (draft.storageMode === 'local' && draft.localVaultDir.trim() !== info?.running.localVaultDir)
  );
  const canMigrate = !busy && Boolean(info) && !runningLocal && Boolean(draft.localVaultDir.trim());
  const canOverwrite = !busy && Boolean(info) && !runningLocal && Boolean(overwriteDir.trim());

  return (
    <section className="tt-settings-section tt-storage-mode">
      <div className="tt-settings-section__header" onClick={() => setIsOpen((v) => !v)}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">モード切替</h2>
      </div>

      {isOpen && (
        <div className="tt-storage-mode__body">
          {message && (
            <div role="status" className={`tt-storage-mode__message tt-storage-mode__message--${message.kind}`}>
              {message.text}
            </div>
          )}

          <div className="tt-storage-mode__card">
            <div className="tt-storage-mode__current">
              現在: <strong>{runningLocal ? 'ローカルで使う' : 'Firestore で使う'}</strong>
              {runningLocal && info && <> （<code>{info.running.localVaultDir}</code>）</>}
            </div>
            <div className="tt-storage-mode__radios" role="radiogroup" aria-label="運用モード">
              <label>
                <input
                  type="radio"
                  name="tt-storage-mode"
                  checked={draft.storageMode === 'firestore'}
                  disabled={busy}
                  onChange={() => setDraft((d) => ({ ...d, storageMode: 'firestore' }))}
                />
                Firestore で使う
              </label>
              <label>
                <input
                  type="radio"
                  name="tt-storage-mode"
                  checked={draft.storageMode === 'local'}
                  disabled={busy}
                  onChange={() => setDraft((d) => ({ ...d, storageMode: 'local' }))}
                />
                ローカルで使う
              </label>
            </div>
            <div className="tt-storage-mode__row">
              <label htmlFor="tt-local-vault-dir" className="tt-storage-mode__label">ThinkファイルFolder:</label>
              <input
                id="tt-local-vault-dir"
                type="text"
                className="tt-settings-input tt-storage-mode__input"
                value={draft.localVaultDir}
                placeholder="例: C:\Users\me\Dropbox\Thinktank"
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
                onChange={(e) => setDraft((d) => ({ ...d, localVaultDir: e.target.value }))}
              />
              <button type="button" className="tt-settings-icon-btn" disabled={busy} onClick={() => void handlePickFolder()} data-tip="フォルダを選ぶ" aria-label="フォルダを選ぶ">
                <FolderOpen size={16} />
              </button>
              <button
                type="button"
                className="tt-settings-icon-btn"
                disabled={busy || !info || (draft.storageMode === 'local' && !draft.localVaultDir.trim())}
                onClick={() => void handleApply()}
                data-tip="設定を保存して再起動"
                data-tip-side="left"
                aria-label="設定を保存して再起動"
              >
                <FolderSync size={16} />
              </button>
            </div>
            <p className="tt-settings-section__desc">
              ローカルで使う場合、Think は ThinkファイルFolder の thinks/ に .md として溜まり、Firebase には接続しません。
              Dropbox や Google Drive の中のフォルダも指定できます。切り替えは再起動で反映し、画面の状態（開いていたタブ等）は初期化されます。
              {changed && <strong> 再起動するまで現在のモードのままです。</strong>}
            </p>
          </div>

          <div className="tt-storage-mode__card">
            <div className="tt-storage-mode__card-title">Firestore と ThinkファイルFolder の間でコピー</div>
            <div className="tt-storage-mode__migrate">
              <button type="button" className="tt-storage-mode__btn" disabled={!canMigrate} onClick={() => void runMigration('toLocal')}>
                <CloudDownload size={14} aria-hidden="true" />
                Firestore → ローカルへコピー
              </button>
              <button type="button" className="tt-storage-mode__btn" disabled={!canMigrate} onClick={() => void runMigration('toFirestore')}>
                <CloudUpload size={14} aria-hidden="true" />
                ローカル → Firestore へコピー
              </button>
            </div>
            <p className="tt-settings-section__desc">
              {runningLocal
                ? 'コピーは「Firestore で使う」モードで実行してください（Firebase へのログインが必要です）。'
                : '同じ Think は更新日時の新しい方を残します。上書きされる版は ThinkファイルFolder の trash/ に退避します。'}
            </p>
          </div>

          <div className="tt-storage-mode__card">
            <div className="tt-storage-mode__card-title">Firestore へ ファイルを上書きコピー</div>
            <div className="tt-storage-mode__row">
              <label htmlFor="tt-overwrite-dir" className="tt-storage-mode__label">上書き用Thinkファイルフォルダー:</label>
              <input
                id="tt-overwrite-dir"
                type="text"
                className="tt-settings-input tt-storage-mode__input"
                value={overwriteDir}
                placeholder="例: C:\Users\me\Desktop\修正版"
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
                onChange={(e) => updateOverwriteDir(e.target.value)}
              />
              <button type="button" className="tt-settings-icon-btn" disabled={busy} onClick={() => void handlePickOverwriteFolder()} data-tip="フォルダを選ぶ" aria-label="フォルダを選ぶ（上書き用）">
                <FolderOpen size={16} />
              </button>
            </div>
            <div className="tt-storage-mode__migrate">
              <button type="button" className="tt-storage-mode__btn" disabled={!canOverwrite} onClick={() => void runOverwrite()}>
                <CloudUpload size={14} aria-hidden="true" />
                上書き用Thinkファイル → Firestoreへ上書きコピー
              </button>
            </div>
            <p className="tt-settings-section__desc">
              {runningLocal
                ? '上書きコピーは「Firestore で使う」モードで実行してください（Firebase へのログインが必要です）。'
                : 'フォルダ内の .md（thinks/ があればその中）を、同じ ID の Think があっても更新日時に関わらず上書きします。更新日時は上書きした時刻になります。上書きされる Firestore の版は Markdownバックアップ先の trash/ に退避します。'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
