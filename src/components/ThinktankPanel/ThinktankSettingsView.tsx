/**
 * ThinktankSettingsView.tsx
 * 保管庫名・アプリケーション状態・データ編集モードを設定するビュー。
 */

import { useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { Save, Monitor, Globe, Laptop, CheckCircle, RefreshCw, AlertCircle, WifiOff, Clock, ChevronDown, ChevronRight, Columns4, Columns2, Brain } from 'lucide-react';
import { StorageManager } from '../../services/storage/StorageManager';
import { batchGenerateEmbeddings, getEmbeddingStatus } from '../../services/EmbeddingApiService';
import type { BatchProgress } from '../../services/EmbeddingApiService';
import type { SyncState } from '../../types';
import type { LayoutMode } from '../Layout/AppLayout';
import './ThinktankSettingsView.css';

const SYNC_LABEL: Record<SyncState, string> = {
  synced:  '同期済み',
  syncing: '同期中…',
  pending: '同期待ち',
  error:   '同期エラー',
  offline: 'オフライン',
};

function SyncIcon({ state }: { state: SyncState }) {
  switch (state) {
    case 'synced':  return <CheckCircle size={13} />;
    case 'syncing': return <RefreshCw   size={13} className="tt-settings-spin" />;
    case 'pending': return <Clock       size={13} />;
    case 'error':   return <AlertCircle size={13} />;
    case 'offline': return <WifiOff     size={13} />;
  }
}

export interface ThinktankSettingsViewRef {
  focus: () => void;
}

interface Props {
  syncState?: SyncState;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
}

const LS_KEY_VALUE   = 'tt-vault-name';
const LS_KEY_HISTORY = 'tt-vault-name-history';
const DATALIST_ID    = 'tt-vault-name-list';
const MAX_HISTORY    = 10;

function loadValue(): string {
  return localStorage.getItem(LS_KEY_VALUE) ?? 'vault';
}

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY_HISTORY) ?? '[]');
  } catch {
    return [];
  }
}

function saveValue(name: string): string[] {
  localStorage.setItem(LS_KEY_VALUE, name);
  const prev = loadHistory().filter(h => h !== name);
  const next = [name, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(LS_KEY_HISTORY, JSON.stringify(next));
  return next;
}

export const ThinktankSettingsView = forwardRef<ThinktankSettingsViewRef, Props>(function ThinktankSettingsView(
  { syncState = 'synced', layoutMode, onLayoutModeChange }: Props,
  ref,
) {
  const firstRadioRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => firstRadioRef.current?.focus(),
  }));

  const mode = StorageManager.instance.mode;
  const [value,          setValue]          = useState(loadValue);
  const [history,        setHistory]        = useState(loadHistory);
  const [saved,          setSaved]          = useState(false);
  const [isStatusOpen,   setIsStatusOpen]   = useState(true);
  const [isVaultOpen,    setIsVaultOpen]    = useState(true);
  const [isEditModeOpen, setIsEditModeOpen] = useState(true);

  // Phase 15: Embedding一括生成
  const [isEmbedOpen,    setIsEmbedOpen]    = useState(true);
  const [embedStatus,    setEmbedStatus]    = useState<{ count: number; model: string } | null>(null);
  const [embedProgress,  setEmbedProgress]  = useState<BatchProgress | null>(null);
  const [embedRunning,   setEmbedRunning]   = useState(false);

  const handleLoadEmbedStatus = useCallback(async () => {
    try {
      const s = await getEmbeddingStatus();
      setEmbedStatus(s);
    } catch {
      setEmbedStatus(null);
    }
  }, []);

  const handleBatchEmbed = useCallback(async () => {
    setEmbedRunning(true);
    setEmbedProgress({ type: 'progress', total: 0, processed: 0, failed: 0 });
    try {
      await batchGenerateEmbeddings(true, (p) => setEmbedProgress(p));
    } catch (e) {
      setEmbedProgress({ type: 'error', total: 0, processed: 0, failed: 0, message: String(e) });
    } finally {
      setEmbedRunning(false);
      handleLoadEmbedStatus();
    }
  }, [handleLoadEmbedStatus]);

  const handleSave = useCallback(() => {
    const trimmed = value.trim() || 'vault';
    setValue(trimmed);
    setHistory(saveValue(trimmed));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
  }, [handleSave]);

  const vaultName = value.trim() || 'vault';

  return (
    <div className="tt-settings-view">

      {/* ── データ編集 ── */}
      <section className="tt-settings-section">
        <div className="tt-settings-section__header" onClick={() => setIsEditModeOpen(v => !v)}>
          {isEditModeOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="tt-settings-section__title">データ編集</h2>
        </div>
        {isEditModeOpen && (
          <div className="tt-settings-layout-modes">
            <p className="tt-settings-section__desc">
              画面のレイアウトモードを選択します。
            </p>
            <label className={`tt-settings-mode-option${layoutMode === 'sipoc' ? ' tt-settings-mode-option--active' : ''}`}>
              <input
                ref={firstRadioRef}
                type="radio"
                name="layout-mode"
                value="sipoc"
                checked={layoutMode === 'sipoc'}
                onChange={() => onLayoutModeChange('sipoc')}
                className="tt-settings-mode-radio"
              />
              <Columns4 size={13} className="tt-settings-mode-icon" />
              <span className="tt-settings-mode-label">SIPOCモード</span>
              <span className="tt-settings-mode-desc">全パネルを表示する標準モード</span>
            </label>
            <label className={`tt-settings-mode-option${layoutMode === 'simple' ? ' tt-settings-mode-option--active' : ''}`}>
              <input
                type="radio"
                name="layout-mode"
                value="simple"
                checked={layoutMode === 'simple'}
                onChange={() => onLayoutModeChange('simple')}
                className="tt-settings-mode-radio"
              />
              <Columns2 size={13} className="tt-settings-mode-icon" />
              <span className="tt-settings-mode-label">簡易モード</span>
              <span className="tt-settings-mode-desc">OverviewとReThinkPanelを非表示</span>
            </label>
          </div>
        )}
      </section>

      {/* ── アプリケーションの状態 ── */}
      <section className="tt-settings-section">
        <div className="tt-settings-section__header" onClick={() => setIsStatusOpen(v => !v)}>
          {isStatusOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="tt-settings-section__title">アプリケーションの状態</h2>
        </div>
        {isStatusOpen && (
          <dl className="tt-settings-status">
            <dt className="tt-settings-status__label">モード</dt>
            <dd className="tt-settings-status__value">
              <span className="tt-settings-status__badge tt-settings-status__badge--mode">
                {mode === 'electron' ? <Laptop size={12} /> : mode === 'local' ? <Monitor size={12} /> : <Globe size={12} />}
                {mode === 'electron' ? 'Electron' : mode === 'local' ? 'Local' : 'PWA'}
              </span>
            </dd>
            <dt className="tt-settings-status__label">同期</dt>
            <dd className="tt-settings-status__value">
              <span className={`tt-settings-status__badge tt-settings-status__badge--sync tt-settings-status__badge--${syncState}`}>
                <SyncIcon state={syncState} />
                {SYNC_LABEL[syncState]}
              </span>
            </dd>
          </dl>
        )}
      </section>


      {/* ── Embedding（Phase 15） ── */}
      <section className="tt-settings-section">
        <div className="tt-settings-section__header" onClick={() => { setIsEmbedOpen(v => !v); if (!embedStatus) handleLoadEmbedStatus(); }}>
          {isEmbedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="tt-settings-section__title">セマンティック検索 (Embedding)</h2>
        </div>
        {isEmbedOpen && (
          <div className="tt-settings-embed">
            <p className="tt-settings-section__desc">
              全エントリーを AI ベクトル化して意味検索を有効にします。
              初回のみ全件処理が必要です（以降は差分のみ）。
            </p>
            {embedStatus && (
              <dl className="tt-settings-status">
                <dt className="tt-settings-status__label">登録済み</dt>
                <dd className="tt-settings-status__value">{embedStatus.count} 件</dd>
                <dt className="tt-settings-status__label">モデル</dt>
                <dd className="tt-settings-status__value">{embedStatus.model}</dd>
              </dl>
            )}
            {embedProgress && (
              <div className="tt-settings-embed__progress">
                {embedProgress.type === 'error'
                  ? <span className="tt-settings-embed__error">エラー: {embedProgress.message}</span>
                  : <>
                      <span>{embedProgress.processed} / {embedProgress.total} 件処理済み{embedProgress.failed > 0 ? ` (失敗: ${embedProgress.failed})` : ''}</span>
                      {embedProgress.lastError && (
                        <div className="tt-settings-embed__error" style={{ marginTop: 4, fontSize: 10, wordBreak: 'break-all' }}>
                          {embedProgress.lastError}
                        </div>
                      )}
                    </>
                }
              </div>
            )}
            <div className="tt-settings-embed__actions">
              <button
                className="tt-settings-save-btn"
                onClick={handleLoadEmbedStatus}
                data-tip="件数を確認"
                data-tip-side="left"
              >
                <RefreshCw size={13} />
                <span>件数確認</span>
              </button>
              <div className="tooltip-wrapper" data-tip="未登録エントリーを一括ベクトル化" data-tip-side="left">
                <button
                  className="tt-settings-save-btn"
                  onClick={handleBatchEmbed}
                  disabled={embedRunning}
                >
                  <Brain size={13} />
                  <span>{embedRunning ? '処理中…' : '一括生成'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 保管庫名 ── */}
      <section className="tt-settings-section">
        <div className="tt-settings-section__header" onClick={() => setIsVaultOpen(v => !v)}>
          {isVaultOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="tt-settings-section__title">保管庫名</h2>
        </div>
        {isVaultOpen && (
          <>
            <p className="tt-settings-section__desc">
              データの保存先に使われる識別名です。
            </p>

            <div className="tt-settings-field">
              <datalist id={DATALIST_ID}>
                {history.map(h => <option key={h} value={h} />)}
              </datalist>
              <input
                className="tt-settings-input"
                type="text"
                list={DATALIST_ID}
                value={value}
                placeholder="vault"
                onChange={e => { setValue(e.target.value); setSaved(false); }}
                onKeyDown={handleKeyDown}
                spellCheck={false}
              />
              <button
                className={`tt-settings-save-btn${saved ? ' tt-settings-save-btn--saved' : ''}`}
                onClick={handleSave}
                data-tip="保存"
                data-tip-side="left"
                aria-label="保存"
              >
                <Save size={13} />
                <span>{saved ? '保存済み' : '保存'}</span>
              </button>
            </div>

            <div className="tt-settings-sub-section">
              <h3 className="tt-settings-sub-section__title">保存先</h3>
              <dl className="tt-settings-paths">
                <dt className="tt-settings-paths__label">Local</dt>
                <dd className="tt-settings-paths__value">
                  <code>ThinktankLocal/<strong>{vaultName}</strong>/&#123;contentType&#125;/&#123;id&#125;.md</code>
                </dd>
                <dt className="tt-settings-paths__label">BigQuery</dt>
                <dd className="tt-settings-paths__value">
                  <code><span className="tt-settings-paths__dataset">thinktank</span>.<strong>{vaultName}</strong></code>
                </dd>
              </dl>
            </div>
          </>
        )}
      </section>
    </div>
  );
});
