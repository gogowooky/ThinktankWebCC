/**
 * WorkoutToolBar.tsx
 * WorkoutPanel 最下段の横型ツールバー。
 * 左: テキスト入力欄（モードに応じた機能）
 * 右: モードアイコン群（全表示・クリックで選択）
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Info, Highlighter, Keyboard, Terminal, BookA, Bell, X, Copyright, ChevronsLeftRight, ChevronsRightLeft } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import './WorkoutToolBar.css';

type ToolMode = 'status' | 'highlight' | 'keyaction' | 'command' | 'translate' | 'reminder';

interface ModeEntry {
  id:          ToolMode;
  icon:        React.ReactNode;
  label:       string;
  placeholder: string;
}

const MODES: ModeEntry[] = [
  { id: 'status',    icon: <Info        size={14} />, label: 'Status',      placeholder: 'Status...' },
  { id: 'highlight', icon: <Highlighter size={14} />, label: 'Highlighter', placeholder: '例: rethink fixme, error warn, info' },
  { id: 'keyaction', icon: <Keyboard    size={14} />, label: 'KeyAction',   placeholder: 'KeyAction...' },
  { id: 'command',   icon: <Terminal    size={14} />, label: 'Command',     placeholder: 'Command...' },
  { id: 'translate', icon: <BookA       size={14} />, label: 'Translate',   placeholder: 'Translate...' },
  { id: 'reminder',  icon: <Bell        size={14} />, label: 'Reminder',    placeholder: 'Reminder...' },
];

interface Props {
  panel: TTWorkoutPanel;
}

export function WorkoutToolBar({ panel }: Props) {
  useAppUpdate(panel);

  const [mode,       setMode]       = useState<ToolMode>('highlight');
  const [text,       setText]       = useState(() => panel.EditorHighlightWord);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // panel.EditorHighlightWord が外部から変わったときに Highlight モードのテキストを同期
  useEffect(() => {
    if (mode === 'highlight') setText(panel.EditorHighlightWord);
  }, [panel.EditorHighlightWord, mode]);

  const handleModeSelect = useCallback((m: ToolMode) => {
    setMode(m);
    setText(m === 'highlight' ? panel.EditorHighlightWord : '');
    inputRef.current?.focus();
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
    <div className={`workout-toolbar${isExpanded ? ' workout-toolbar--expanded' : ''}`}>
      {/* テキスト入力欄 */}
      <input
        ref={inputRef}
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

      {/* モードアイコン群（右端・横並び・全表示）*/}
      <div className="workout-toolbar__modes">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`workout-toolbar__mode-btn${mode === m.id ? ' workout-toolbar__mode-btn--active' : ''}`}
            onClick={() => handleModeSelect(m.id)}
            title={m.label}
            aria-label={m.label}
          >
            {m.icon}
          </button>
        ))}
      </div>

      {/* ユーティリティボタン群 */}
      <div className="workout-toolbar__sep" />
      <div className="workout-toolbar__utils">
        <button
          className="workout-toolbar__util-btn"
          title="作成者"
          aria-label="作成者"
        >
          <Copyright size={14} />
        </button>
        <button
          className={`workout-toolbar__util-btn${isExpanded ? '' : ' workout-toolbar__util-btn--active'}`}
          onClick={() => setIsExpanded(false)}
          title="ツールバー縮小"
          aria-label="ツールバー縮小"
        >
          <ChevronsRightLeft size={14} />
        </button>
        <button
          className={`workout-toolbar__util-btn${isExpanded ? ' workout-toolbar__util-btn--active' : ''}`}
          onClick={() => setIsExpanded(true)}
          title="ツールバー拡大"
          aria-label="ツールバー拡大"
        >
          <ChevronsLeftRight size={14} />
        </button>
      </div>
    </div>
  );
}
