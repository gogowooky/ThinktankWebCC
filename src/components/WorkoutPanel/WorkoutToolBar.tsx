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

interface KAState {
  modifiers: string;
  key:       string;
  mouse:     string;
  touch:     string;
  focus:     string;
}
const KA_INIT: KAState = { modifiers: '-', key: '-', mouse: '-', touch: '-', focus: '-' };

/** フォーカス要素からコンポーネント名を返す */
function getFocusName(el: Element | null): string {
  if (!el || el === document.body || el === document.documentElement) return 'None';

  // WorkoutArea (active content pane)
  if (el.closest('.workout-area')) return 'Workout.ActivePane';

  // WorkoutSettingPanel
  const ws = el.closest('.workout-setting-panel');
  if (ws) {
    const txt = ws.querySelector('.workout-setting-panel__header')?.textContent?.toLowerCase() ?? '';
    if (txt.includes('texteditor')) return 'WorkoutSetting.TextEditor';
    if (txt.includes('markdown'))   return 'WorkoutSetting.Markdown';
    if (txt.includes('datagrid'))   return 'WorkoutSetting.DataGrid';
    if (txt.includes('card'))       return 'WorkoutSetting.Card';
    if (txt.includes('graph'))      return 'WorkoutSetting.Graph';
    return 'WorkoutSetting.Workout';
  }

  // ThinktankPanel
  const tt = el.closest('.thinktank-panel, .thinktank-area');
  if (tt) {
    const panel = tt.closest('.thinktank-panel') ?? tt.parentElement ?? tt;
    const label = panel.querySelector('.ribbon-icon-btn--active')?.getAttribute('aria-label') ?? '';
    if (label === '検索')        return 'Thinktank.Search';
    if (label === 'Thought一覧') return 'Thinktank.Thoughts';
    if (label === 'AI相談')      return 'Thinktank.Chat';
    if (label === '設定')        return 'Thinktank.Setting';
    return 'Thinktank.Thinks';
  }

  // OverviewPanel
  const ov = el.closest('.overview-panel, .overview-area');
  if (ov) {
    const panel = ov.closest('.overview-panel') ?? ov.parentElement ?? ov;
    const label = panel.querySelector('.ribbon-icon-btn--active')?.getAttribute('aria-label') ?? '';
    if (label === 'AI相談') return 'Overview.Chat';
    if (label === '設定')   return 'Overview.Setting';
    if (ov.querySelector('.ai-chat-view')) return 'Overview.Chat';
    const titleText = panel.querySelector('.overview-area__title-row')?.textContent ?? '';
    if (titleText.includes('Thought分析')) return 'Overview.Analyze';
    return 'Overview.Thinks';
  }

  // ReThinkPanel
  const rt = el.closest('.rethink-panel, .rethink-area');
  if (rt) {
    const panel = rt.closest('.rethink-panel') ?? rt.parentElement ?? rt;
    const label = panel.querySelector('.ribbon-icon-btn--active')?.getAttribute('aria-label') ?? '';
    if (label === '設定') return 'ReThink.Setting';
    return 'ReThink.Chat';
  }

  return 'None';
}

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
  const [kaState,     setKaState]     = useState<KAState>(KA_INIT);
  const inputRef       = useRef<HTMLInputElement>(null);
  const rafRef         = useRef<number>(0);

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

  // KeyAction モード: window 全体のイベントをウォッチ
  useEffect(() => {
    if (mode !== 'keyaction') { setKaState(KA_INIT); return; }

    const onKeyDown = (e: KeyboardEvent) => {
      const mods = [
        e.ctrlKey  && 'Ctrl',
        e.altKey   && 'Alt',
        e.shiftKey && 'Shift',
        e.metaKey  && 'Meta',
      ].filter(Boolean).join('+') || '-';
      const k = e.key === ' ' ? 'Space' : (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      setKaState(s => ({ ...s, modifiers: mods, key: k }));
    };

    const onMouse = (e: MouseEvent) => {
      const label = `${e.type}(${Math.round(e.clientX)},${Math.round(e.clientY)})`;
      if (e.type === 'mousemove') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() =>
          setKaState(s => ({ ...s, mouse: label }))
        );
      } else {
        setKaState(s => ({ ...s, mouse: label }));
      }
    };

    const onTouch = (e: TouchEvent) => {
      const count = e.type === 'touchend' ? e.changedTouches.length : e.touches.length;
      setKaState(s => ({ ...s, touch: `${e.type}(${count})` }));
    };

    const onFocusIn = (e: FocusEvent) => {
      setKaState(s => ({ ...s, focus: getFocusName(e.target as Element) }));
    };
    const onWindowBlur = () => {
      setKaState(s => ({ ...s, focus: '-' }));
    };

    // 初期フォーカス
    setKaState(s => ({ ...s, focus: getFocusName(document.activeElement) }));

    window.addEventListener('keydown',    onKeyDown);
    window.addEventListener('mousedown',  onMouse);
    window.addEventListener('mouseup',    onMouse);
    window.addEventListener('click',      onMouse);
    window.addEventListener('mousemove',  onMouse, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchmove',  onTouch, { passive: true });
    window.addEventListener('touchend',   onTouch, { passive: true });
    window.addEventListener('focusin',    onFocusIn);
    window.addEventListener('blur',       onWindowBlur);

    return () => {
      window.removeEventListener('keydown',    onKeyDown);
      window.removeEventListener('mousedown',  onMouse);
      window.removeEventListener('mouseup',    onMouse);
      window.removeEventListener('click',      onMouse);
      window.removeEventListener('mousemove',  onMouse);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('touchmove',  onTouch);
      window.removeEventListener('touchend',   onTouch);
      window.removeEventListener('focusin',    onFocusIn);
      window.removeEventListener('blur',       onWindowBlur);
      cancelAnimationFrame(rafRef.current);
    };
  }, [mode]);

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
      ) : mode === 'keyaction' && authorState === 'off' ? (
        <div className="workout-toolbar__keyaction">
          <span className="workout-toolbar__ka-field">
            <span className="workout-toolbar__ka-label">focus</span>
            <span className="workout-toolbar__ka-value workout-toolbar__ka-value--focus">{kaState.focus}</span>
          </span>
          <span className="workout-toolbar__ka-divider" />
          <span className="workout-toolbar__ka-field">
            <span className="workout-toolbar__ka-label">mod</span>
            <span className="workout-toolbar__ka-value">{kaState.modifiers}</span>
          </span>
          <span className="workout-toolbar__ka-sep">·</span>
          <span className="workout-toolbar__ka-field">
            <span className="workout-toolbar__ka-label">key</span>
            <span className="workout-toolbar__ka-value">{kaState.key}</span>
          </span>
          <span className="workout-toolbar__ka-sep">·</span>
          <span className="workout-toolbar__ka-field">
            <span className="workout-toolbar__ka-label">mouse</span>
            <span className="workout-toolbar__ka-value">{kaState.mouse}</span>
          </span>
          <span className="workout-toolbar__ka-sep">·</span>
          <span className="workout-toolbar__ka-field">
            <span className="workout-toolbar__ka-label">touch</span>
            <span className="workout-toolbar__ka-value">{kaState.touch}</span>
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
