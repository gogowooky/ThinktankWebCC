/**
 * WorkoutToolBar.tsx
 * WorkoutPanel 最下段の横型ツールバー。
 * 左: テキスト入力欄（モードに応じた機能）
 * 右: モードアイコン群 + ユーティリティボタン
 *
 * 縮小時: WorkoutPanel 内下段に表示（ChevronsLeftRight アイコン）
 * 拡大時: アプリ全体の最下段に固定表示（ChevronsRightLeft アイコン）
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Info, Highlighter, Keyboard, Terminal, BookA, Bell, X, Copyright, ChevronsLeftRight, ChevronsRightLeft } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import copywriteRaw from '../../../docs/copywrite.txt?raw';
import './WorkoutToolBar.css';

const _cw = JSON.parse(copywriteRaw);
const AUTHOR_BANNER_TEXT = `${_cw.appName} ver.${_cw.version}, ${_cw.copyright.holder}(${_cw.copyright.year}). --- [${_cw.projectName}:${_cw.commitId}](${_cw.commitDateTime}) --- ${_cw.commitMessage}`;

type AuthorState = 'off' | 'banner' | 'static';

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

  const [mode,        setMode]        = useState<ToolMode>('highlight');
  const [text,        setText]        = useState(() => panel.HighlightWord);
  const [isExpanded,  setIsExpanded]  = useState(false);
  const [authorState, setAuthorState] = useState<AuthorState>('off');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExpanded) {
      document.body.classList.add('toolbar-expanded');
    } else {
      document.body.classList.remove('toolbar-expanded');
    }
    return () => { document.body.classList.remove('toolbar-expanded'); };
  }, [isExpanded]);

  useEffect(() => {
    if (mode === 'highlight') setText(panel.HighlightWord);
  }, [panel.HighlightWord, mode]);

  const handleAuthorToggle = useCallback(() => {
    setAuthorState(s => s === 'off' ? 'banner' : 'off');
  }, []);

  const handleBannerClick = useCallback(() => {
    setAuthorState('static');
  }, []);

  const handleModeSelect = useCallback((m: ToolMode) => {
    setMode(m);
    setAuthorState('off');
    setText(m === 'highlight' ? panel.HighlightWord : '');
    inputRef.current?.focus();
  }, [panel]);

  const handleTextChange = useCallback((v: string) => {
    setText(v);
    if (mode === 'highlight') panel.SetHighlightWord(v);
  }, [mode, panel]);

  const handleBlur = useCallback(() => {
    if (mode === 'highlight' && text.trim()) {
      panel.AddHighlightHistory(text.trim());
    }
  }, [mode, panel, text]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && mode === 'highlight' && text.trim()) {
      panel.AddHighlightHistory(text.trim());
    }
  }, [mode, panel, text]);

  const handleClear = useCallback(() => {
    setText('');
    if (mode === 'highlight') panel.SetHighlightWord('');
  }, [mode, panel]);

  const current = MODES.find(m => m.id === mode)!;
  const isAuthorOn = authorState !== 'off';

  return (
    <div className={`workout-toolbar${isExpanded ? ' workout-toolbar--expanded' : ''}`}>

      {/* 作成者バナー / 作成者静的表示 / 通常入力欄 */}
      {authorState === 'banner' ? (
        <div
          className="workout-toolbar__author-banner"
          onClick={handleBannerClick}
          title="クリックで静的表示"
        >
          <span className="workout-toolbar__author-banner-text">
            {AUTHOR_BANNER_TEXT}
          </span>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            className="workout-toolbar__input"
            type="text"
            value={authorState === 'static' ? AUTHOR_BANNER_TEXT : text}
            readOnly={authorState === 'static'}
            list={authorState === 'off' && mode === 'highlight' ? 'toolbar-highlight-history' : undefined}
            onChange={e => handleTextChange(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={current.placeholder}
            spellCheck={false}
          />
          {authorState === 'off' && mode === 'highlight' && (
            <datalist id="toolbar-highlight-history">
              {panel.HighlightHistory.map((h: string, i: number) => (
                <option key={i} value={h} />
              ))}
            </datalist>
          )}
          {authorState === 'off' && text && (
            <button
              className="workout-toolbar__clear-btn"
              onClick={handleClear}
              data-tip="クリア"
              aria-label="クリア"
            >
              <X size={12} />
            </button>
          )}
        </>
      )}

      {/* モードアイコン群 */}
      <div className="workout-toolbar__modes">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`workout-toolbar__mode-btn${!isAuthorOn && mode === m.id ? ' workout-toolbar__mode-btn--active' : ''}`}
            onClick={() => handleModeSelect(m.id)}
            data-tip={m.label}
            aria-label={m.label}
          >
            {m.icon}
          </button>
        ))}
      </div>

      {/* ユーティリティボタン */}
      <div className="workout-toolbar__utils">
        <button
          className={`workout-toolbar__util-btn${isAuthorOn ? ' workout-toolbar__util-btn--active' : ''}`}
          onClick={handleAuthorToggle}
          data-tip="作成者"
          data-tip-side="left"
          aria-label="作成者"
        >
          <Copyright size={14} />
        </button>
        <button
          className="workout-toolbar__util-btn"
          onClick={() => setIsExpanded(v => !v)}
          data-tip={isExpanded ? 'ツールバー縮小' : 'ツールバー拡大'}
          data-tip-side="left"
          aria-label={isExpanded ? 'ツールバー縮小' : 'ツールバー拡大'}
        >
          {isExpanded ? <ChevronsRightLeft size={14} /> : <ChevronsLeftRight size={14} />}
        </button>
      </div>
    </div>
  );
}
