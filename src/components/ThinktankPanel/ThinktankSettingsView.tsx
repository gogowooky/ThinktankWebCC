/**
 * ThinktankSettingsView.tsx
 * 保管庫名を設定するビュー。
 */

import { useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { Save, ChevronDown, ChevronRight, AArrowUp, AArrowDown } from 'lucide-react';
import { TTActions } from '../../views/TTActions';
import './ThinktankSettingsView.css';

export interface ThinktankSettingsViewRef {
  focus: () => void;
}

interface Props {}

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
  _props,
  ref,
) {
  const vaultInputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => vaultInputRef.current?.focus(),
  }));

  const [value,          setValue]          = useState(loadValue);
  const [history,        setHistory]        = useState(loadHistory);
  const [saved,          setSaved]          = useState(false);
  const [isVaultOpen,    setIsVaultOpen]    = useState(true);
  const [isZoomOpen,     setIsZoomOpen]     = useState(true);

  const handleZoom = useCallback((actionId: 'Application.Display.Zoom:ZoomIn' | 'Application.Display.Zoom:ZoomOut') => {
    TTActions.Execute(actionId);
  }, []);

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

      {/* ── 表示サイズ ── */}
      <section className="tt-settings-section">
        <div className="tt-settings-section__header" onClick={() => setIsZoomOpen(v => !v)}>
          {isZoomOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="tt-settings-section__title">表示サイズ</h2>
        </div>
        {isZoomOpen && (
          <div className="tt-settings-zoom">
            <div className="tt-settings-zoom__row">
              <span className="tt-settings-zoom__label">拡大</span>
              <button
                className="tt-settings-zoom__icon"
                onClick={() => handleZoom('Application.Display.Zoom:ZoomIn')}
                data-tip="拡大表示"
                aria-label="拡大表示"
              >
                <AArrowUp size={16} />
              </button>
            </div>
            <div className="tt-settings-zoom__row">
              <span className="tt-settings-zoom__label">縮小</span>
              <button
                className="tt-settings-zoom__icon"
                onClick={() => handleZoom('Application.Display.Zoom:ZoomOut')}
                data-tip="縮小表示"
                aria-label="縮小表示"
              >
                <AArrowDown size={16} />
              </button>
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
                ref={vaultInputRef}
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
