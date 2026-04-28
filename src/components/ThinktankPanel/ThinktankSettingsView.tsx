/**
 * ThinktankSettingsView.tsx
 * 保管庫名を設定するビュー。
 * 履歴付きtextboxで vault 名を入力・保存する。
 */

import { useState, useCallback } from 'react';
import { Save } from 'lucide-react';
import './ThinktankSettingsView.css';

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

export function ThinktankSettingsView() {
  const [value,   setValue]   = useState(loadValue);
  const [history, setHistory] = useState(loadHistory);
  const [saved,   setSaved]   = useState(false);

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
      <section className="tt-settings-section">
        <h2 className="tt-settings-section__title">保管庫名</h2>
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
            title="保存"
            aria-label="保存"
          >
            <Save size={13} />
            <span>{saved ? '保存済み' : '保存'}</span>
          </button>
        </div>
      </section>

      <section className="tt-settings-section">
        <h2 className="tt-settings-section__title">保存先</h2>
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
      </section>
    </div>
  );
}
