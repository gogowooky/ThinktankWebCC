/**
 * ThinktankSettingsView.tsx
 * Thinktank>設定。アクション・概要のAI設定・Firebase・Google Drive API・Vault を並べる。
 */

import { useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { Save, ChevronDown, ChevronRight, AArrowUp, AArrowDown, Columns2, Columns4 } from 'lucide-react';
import { TTActions } from '../../views/TTActions';
import { usePanelSectionsSetAll } from '../../hooks/usePanelSectionsSetAll';
import { DomainProfileSettingsPanel } from './DomainProfileSettingsPanel';
import { FirebaseSettingsPanel } from './FirebaseSettingsPanel';
import { GoogleDriveSettingsPanel } from './GoogleDriveSettingsPanel';
import './ThinktankSettingsView.css';

export interface ThinktankSettingsViewRef {
  focus: () => void;
}

type Props = Record<never, never>; // props なし

const LS_KEY_VALUE   = 'tt-vault-name';
const LS_KEY_HISTORY = 'tt-vault-name-history';
const DATALIST_ID    = 'tt-vault-name-list';

function loadValue(): string {
  return localStorage.getItem(LS_KEY_VALUE) ?? 'vault_ver2';
}

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY_HISTORY) ?? '[]');
  } catch {
    return [];
  }
}

export const ThinktankSettingsView = forwardRef<ThinktankSettingsViewRef, Props>(function ThinktankSettingsView(
  _props,
  ref,
) {
  // Vault 欄は最下段にあるので、そこへフォーカスすると開いた瞬間に末尾までスクロールしてしまう
  const rootRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => rootRef.current?.focus({ preventScroll: true }),
  }));

  const [value,          setValue]          = useState(loadValue);
  const [history]                           = useState(loadHistory);
  const [isVaultOpen,    setIsVaultOpen]    = useState(true);
  const [isZoomOpen,     setIsZoomOpen]     = useState(true);
  usePanelSectionsSetAll('thinktank', [setIsVaultOpen, setIsZoomOpen]);

  const handleZoom = useCallback((actionId: 'Application.Display.Zoom:ZoomIn' | 'Application.Display.Zoom:ZoomOut') => {
    void TTActions.Execute(actionId);
  }, []);

  const handleMode = useCallback((actionId: 'Application.PanelDisplay.Mode:Edit' | 'Application.PanelDisplay.Mode:Think') => {
    void TTActions.Execute(actionId);
  }, []);

  return (
    <div ref={rootRef} className="tt-settings-view" tabIndex={-1}>

      {/* ── アクション ── */}
      <section className="tt-settings-section">
        <div className="tt-settings-section__header" onClick={() => setIsZoomOpen(v => !v)}>
          {isZoomOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="tt-settings-section__title">アクション</h2>
        </div>
        {isZoomOpen && (
          <div className="tt-settings-zoom">
            <div className="tt-settings-zoom__row">
              <span className="tt-settings-zoom__label">サイズ</span>
              <button
                className="tt-settings-zoom__icon"
                onClick={() => handleZoom('Application.Display.Zoom:ZoomIn')}
                data-tip="拡大表示"
                aria-label="拡大表示"
              >
                <AArrowUp size={16} />
              </button>
              <button
                className="tt-settings-zoom__icon"
                onClick={() => handleZoom('Application.Display.Zoom:ZoomOut')}
                data-tip="縮小表示"
                aria-label="縮小表示"
              >
                <AArrowDown size={16} />
              </button>
            </div>
            <div className="tt-settings-zoom__row">
              <span className="tt-settings-zoom__label">モード</span>
              <button
                className="tt-settings-zoom__icon"
                onClick={() => handleMode('Application.PanelDisplay.Mode:Edit')}
                data-tip="Editモード"
                aria-label="Editモード"
              >
                <Columns2 size={16} />
              </button>
              <button
                className="tt-settings-zoom__icon"
                onClick={() => handleMode('Application.PanelDisplay.Mode:Think')}
                data-tip="Thinkモード"
                aria-label="Thinkモード"
              >
                <Columns4 size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      <DomainProfileSettingsPanel />
      <FirebaseSettingsPanel />
      <GoogleDriveSettingsPanel />

      {/* ── Vault ── */}
      <section className="tt-settings-section">
        <div className="tt-settings-section__header" onClick={() => setIsVaultOpen(v => !v)}>
          {isVaultOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="tt-settings-section__title">Vault</h2>
        </div>
        {isVaultOpen && (
          <>
            <p className="tt-settings-section__desc">
              Firestore上でThinkを分けるデータベース識別名です。
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
                placeholder="vault_ver2"
                onChange={e => setValue(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              {/* Vault の切替はまだ受け付けないので、保存は押せないまま置いておく */}
              <button className="tt-settings-icon-btn" disabled aria-label="保存">
                <Save size={16} />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
});
