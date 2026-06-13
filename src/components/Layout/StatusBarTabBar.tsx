import React from 'react';
import { Info, Highlighter, Keyboard, Terminal, BookA, Bell, Copyright } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

export type ToolMode = 'status' | 'highlight' | 'keyaction' | 'command' | 'translate' | 'reminder';

export interface ModeEntry {
  id:          ToolMode;
  icon:        React.ReactNode;
  label:       string;
  placeholder: string;
}

// ── Constant ────────────────────────────────────────────────────────────────

export const MODES: ModeEntry[] = [
  { id: 'status',    icon: <Info        size={14} />, label: 'Status',      placeholder: 'Status...' },
  { id: 'highlight', icon: <Highlighter size={14} />, label: 'Highlighter', placeholder: '例: rethink fixme, error warn, info' },
  { id: 'keyaction', icon: <Keyboard    size={14} />, label: 'KeyAction',   placeholder: 'KeyAction...' },
  { id: 'command',   icon: <Terminal    size={14} />, label: 'Command',     placeholder: 'Command...' },
  { id: 'translate', icon: <BookA       size={14} />, label: 'Translate',   placeholder: 'Translate...' },
  { id: 'reminder',  icon: <Bell        size={14} />, label: 'Reminder',    placeholder: 'Reminder...' },
];

export const TOOLBAR_TO_MODE: Record<string, ToolMode> = Object.fromEntries(
  MODES.map(m => [m.label, m.id])
) as Record<string, ToolMode>;

export const MODE_TO_TOOLBAR: Record<ToolMode, string> = Object.fromEntries(
  MODES.map(m => [m.id, m.label])
) as Record<ToolMode, string>;

// ── Component ──────────────────────────────────────────────────────────────

interface TabBarProps {
  mode:           ToolMode;
  isAuthorOn:     boolean;
  onModeSelect:   (m: ToolMode) => void;
  onAuthorToggle: () => void;
}

export function StatusBarTabBar({
  mode,
  isAuthorOn,
  onModeSelect,
  onAuthorToggle,
}: TabBarProps) {
  return (
    <>
      {/* モードアイコン群 */}
      <div className="ApplicationStatusBarArea__modes">
        {MODES.map(m => (
          <button
            key={m.id}
            id={`StatusBarModeButton${m.id}`}
            className={`ApplicationStatusBarArea__mode-btn${!isAuthorOn && mode === m.id ? ' ApplicationStatusBarArea__mode-btn--active' : ''}`}
            onClick={() => onModeSelect(m.id)}
            data-tip={m.label}
            aria-label={m.label}
          >
            {m.icon}
          </button>
        ))}
      </div>

      {/* ユーティリティボタン */}
      <div className="ApplicationStatusBarArea__utils">
        <button
          className={`ApplicationStatusBarArea__util-btn${isAuthorOn ? ' ApplicationStatusBarArea__util-btn--active' : ''}`}
          onClick={onAuthorToggle}
          data-tip="Copyright"
          data-tip-side="left"
          aria-label="Copyright"
        >
          <Copyright size={14} />
        </button>
      </div>
    </>
  );
}
