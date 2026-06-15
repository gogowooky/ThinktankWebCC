import { X } from 'lucide-react';
import { useState, useEffect, type ReactNode } from 'react';
import { TTUIStateManager } from '../../views/TTUIStateManager';

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
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(() =>
    TTUIStateManager.instance.getProperty('ToolBar.StatusMode.Text')
  );

  // 外部変更を同期するリスナー
  useEffect(() => {
    const handleStateChange = () => {
      if (!isFocused) {
        setInputValue(TTUIStateManager.instance.getProperty('ToolBar.StatusMode.Text'));
      }
    };
    TTUIStateManager.instance.addListener('ToolBar.StatusMode.Text', handleStateChange);
    
    // 他のプロパティの変更を検知して再描画
    const handleAnyChange = () => {
      if (!isFocused) {
        // トリガー再描画
        setInputValue(TTUIStateManager.instance.getProperty('ToolBar.StatusMode.Text'));
      }
    };
    TTUIStateManager.instance.addListener('*', handleAnyChange);

    return () => {
      TTUIStateManager.instance.removeListener('ToolBar.StatusMode.Text', handleStateChange);
      TTUIStateManager.instance.removeListener('*', handleAnyChange);
    };
  }, [isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsFocused(false);
      TTUIStateManager.instance.applyProperty('ToolBar.StatusMode.Text', inputValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      TTUIStateManager.instance.applyProperty('ToolBar.StatusMode.Text', inputValue);
      e.currentTarget.blur();
    }
  };

  // TextBox用の表示文字列を作成
  const statusModeText = TTUIStateManager.instance.getProperty('ToolBar.StatusMode.Text') || '';
  const keys = statusModeText.split(',').map(k => k.trim()).filter(Boolean);
  const items = keys.map(key => {
    const val = TTUIStateManager.instance.getProperty(key);
    return `${key}:[${val}]`;
  });
  const displayText = items.join(' ');

  if (isFocused) {
    return (
      <div
        className="ApplicationStatusBarArea__status-panel-container"
        onBlur={handleBlur}
      >
        <input
          type="text"
          className="ApplicationStatusBarArea__status-input"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="StatusIDs (comma separated)"
        />
      </div>
    );
  }

  return (
    <div
      className="ApplicationStatusBarArea__status-panel-container"
      tabIndex={0}
      onFocus={handleFocus}
      title="クリックして編集"
    >
      <span className="ApplicationStatusBarArea__status-text">
        {displayText || 'No status items configured'}
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
  const displayFocus = (kaState.focus && kaState.focus !== 'None' && kaState.focus !== 'Application.StatusBarArea')
    ? kaState.focus
    : '-';

  return (
    <div className="ApplicationStatusBarArea__keyaction">
      <span className="ApplicationStatusBarArea__ka-field">
        <span className="ApplicationStatusBarArea__ka-label">FOCUS</span>
        <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--focus">{displayFocus}</span>
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
