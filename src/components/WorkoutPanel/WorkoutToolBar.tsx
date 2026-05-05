/**
 * WorkoutToolBar.tsx
 * WorkoutPanel 最下段の横型ツールバー。
 * 左: モードアイコン（押下で吹き出し型プルダウン）
 * 右: テキスト入力欄（モードに応じた機能）
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Info, Highlighter, Keyboard, Terminal, BookA, Bell, X } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import './WorkoutToolBar.css';

type ToolMode = 'status' | 'highlight' | 'keyaction' | 'command' | 'translate' | 'reminder';

interface ModeEntry {
  id:    ToolMode;
  icon:  React.ReactNode;
  label: string;
  placeholder: string;
}

const MODES: ModeEntry[] = [
  { id: 'status',    icon: <Info        size={14} />, label: 'Status',     placeholder: 'Status...' },
  { id: 'highlight', icon: <Highlighter size={14} />, label: 'Highlighter', placeholder: '例: rethink fixme, error warn, info' },
  { id: 'keyaction', icon: <Keyboard    size={14} />, label: 'KeyAction',  placeholder: 'KeyAction...' },
  { id: 'command',   icon: <Terminal    size={14} />, label: 'Command',    placeholder: 'Command...' },
  { id: 'translate', icon: <BookA       size={14} />, label: 'Translate',  placeholder: 'Translate...' },
  { id: 'reminder',  icon: <Bell        size={14} />, label: 'Reminder',   placeholder: 'Reminder...' },
];

interface Props {
  panel: TTWorkoutPanel;
}

export function WorkoutToolBar({ panel }: Props) {
  useAppUpdate(panel);

  const [mode,      setMode]      = useState<ToolMode>('highlight');
  const [showModes, setShowModes] = useState(false);
  const [text,      setText]      = useState(() => panel.EditorHighlightWord);
  const wrapRef = useRef<HTMLDivElement>(null);

  // panel.EditorHighlightWord が外部から変わったときにHLモードのテキストを同期
  useEffect(() => {
    if (mode === 'highlight') setText(panel.EditorHighlightWord);
  }, [panel.EditorHighlightWord, mode]);

  // ポップオーバー外クリックで閉じる
  useEffect(() => {
    if (!showModes) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowModes(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModes]);

  const handleModeSelect = useCallback((m: ToolMode) => {
    setMode(m);
    setShowModes(false);
    setText(m === 'highlight' ? panel.EditorHighlightWord : '');
  }, [panel]);

  const handleTextChange = useCallback((v: string) => {
    setText(v);
    if (mode === 'highlight') panel.SetEditorHighlightWord(v);
  }, [mode, panel]);

  const handleBlur = useCallback(() => {
    if (mode === 'highlight' && text.trim()) {
      panel.AddEditorHighlightHistory(text.trim());
    }
  }, [mode, panel, text]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && mode === 'highlight' && text.trim()) {
      panel.AddEditorHighlightHistory(text.trim());
    }
  }, [mode, panel, text]);

  const handleClear = useCallback(() => {
    setText('');
    if (mode === 'highlight') panel.SetEditorHighlightWord('');
  }, [mode, panel]);

  const current = MODES.find(m => m.id === mode)!;

  return (
    <div className="workout-toolbar">
      {/* モードアイコン（吹き出しポップオーバー） */}
      <div className="workout-toolbar__mode-wrap" ref={wrapRef}>
        <button
          className="workout-toolbar__mode-btn"
          onClick={() => setShowModes(v => !v)}
          data-tip={current.label}
          aria-label={current.label}
        >
          {current.icon}
        </button>

        {showModes && (
          <div className="workout-toolbar__popover">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`workout-toolbar__pop-btn${mode === m.id ? ' workout-toolbar__pop-btn--active' : ''}`}
                onClick={() => handleModeSelect(m.id)}
                data-tip={m.label}
                aria-label={m.label}
              >
                {m.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* テキスト入力欄 */}
      <input
        className="workout-toolbar__input"
        type="text"
        value={text}
        list={mode === 'highlight' ? 'toolbar-highlight-history' : undefined}
        onChange={e => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={current.placeholder}
        spellCheck={false}
      />
      {mode === 'highlight' && (
        <datalist id="toolbar-highlight-history">
          {panel.EditorHighlightHistory.map((h, i) => (
            <option key={i} value={h} />
          ))}
        </datalist>
      )}

      {/* クリアボタン */}
      {text && (
        <button
          className="workout-toolbar__clear-btn"
          onClick={handleClear}
          title="クリア"
          aria-label="クリア"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
