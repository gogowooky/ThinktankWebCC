import { X } from 'lucide-react';
import type { ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface KAState {
  modifiers: string;
  key:       string;
  mouse:     string;
  touch:     string;
  focus:     string;
}

// ── 1. StatusBarAuthorBanner ────────────────────────────────────────────────
interface BannerProps {
  bannerText: string;
  onClick:    () => void;
}

export function StatusBarAuthorBanner({ bannerText, onClick }: BannerProps) {
  return (
    <div
      className="ApplicationStatusBarArea__author-banner"
      onClick={onClick}
      title="クリックで静的表示"
    >
      <span className="ApplicationStatusBarArea__author-banner-text">
        {bannerText}
      </span>
    </div>
  );
}

// ── 2. StatusBarStatusPanel ──────────────────────────────────────────────────
interface StatusPanelProps {
  focus: string;
}

export function StatusBarStatusPanel({ focus }: StatusPanelProps) {
  return (
    <div className="ApplicationStatusBarArea__keyaction">
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">focus</span>
        <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--focus">{focus}</span>
      </span>
    </div>
  );
}

// ── 3. StatusBarKeyActionPanel ──────────────────────────────────────────────
interface KeyActionPanelProps {
  kaState:          KAState;
  exMode:           string;
  exModeModKey:     string;
  lastActionDisplay: string;
}

export function StatusBarKeyActionPanel({
  kaState,
  exMode,
  exModeModKey,
  lastActionDisplay,
}: KeyActionPanelProps) {
  return (
    <div className="ApplicationStatusBarArea__keyaction">
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">focus</span>
        <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--focus">{kaState.focus}</span>
      </span>
      <span className="ApplicationStatusBarArea__ka-divider" />
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">mod</span>
        <span className="ApplicationStatusBarArea__ka-value">{kaState.modifiers}</span>
      </span>
      <span className="ApplicationStatusBarArea__ka-sep">·</span>
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">key</span>
        <span className="ApplicationStatusBarArea__ka-value">{kaState.key}</span>
      </span>
      <span className="ApplicationStatusBarArea__ka-sep">·</span>
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">mouse</span>
        <span className="ApplicationStatusBarArea__ka-value">{kaState.mouse}</span>
      </span>
      <span className="ApplicationStatusBarArea__ka-sep">·</span>
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">touch</span>
        <span className="ApplicationStatusBarArea__ka-value">{kaState.touch}</span>
      </span>
      <span className="ApplicationStatusBarArea__ka-divider" />
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">exmode</span>
        <span className={`ApplicationStatusBarArea__ka-value${exMode ? ' ApplicationStatusBarArea__ka-value--exmode' : ''}`}>
          {exMode || '-'}
        </span>
      </span>
      {exMode && (
        <>
          <span className="ApplicationStatusBarArea__ka-sep">·</span>
          <span className="ApplicationStatusBarArea__ka-field">
            <span className="ApplicationStatusBarArea__ka-label">exmod</span>
            <span className="ApplicationStatusBarArea__ka-value">{exModeModKey}</span>
          </span>
        </>
      )}
      <span className="ApplicationStatusBarArea__ka-divider" />
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">action</span>
        <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--action">{lastActionDisplay || '-'}</span>
      </span>
    </div>
  );
}

// ── 4. StatusBarInputPanel ──────────────────────────────────────────────────
interface InputPanelProps {
  inputRef:       React.RefObject<HTMLInputElement>;
  value:          string;
  onChange:       (val: string) => void;
  onClear:        () => void;
  onBlur?:        React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?:     React.KeyboardEventHandler<HTMLInputElement>;
  placeholder:    string;
  isReadOnly?:    boolean;
  showHistory?:   boolean;
  historyList?:   string[];
  historyId?:     string;
}

export function StatusBarInputPanel({
  inputRef,
  value,
  onChange,
  onClear,
  onBlur,
  onKeyDown,
  placeholder,
  isReadOnly = false,
  showHistory = false,
  historyList = [],
  historyId = 'status-bar-highlight-history',
}: InputPanelProps) {
  return (
    <>
      <input
        ref={inputRef}
        id="StatusBarTextInput"
        className="ApplicationStatusBarArea__input"
        type="text"
        value={value}
        readOnly={isReadOnly}
        list={showHistory ? historyId : undefined}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
      />
      {showHistory && historyList.length > 0 && (
        <datalist id={historyId}>
          {historyList.map((h, i) => (
            <option key={i} value={h} />
          ))}
        </datalist>
      )}
      {!isReadOnly && value && (
        <button
          className="ApplicationStatusBarArea__clear-btn"
          onClick={onClear}
          data-tip="クリア"
          aria-label="クリア"
        >
          <X size={12} />
        </button>
      )}
    </>
  );
}
