/**
 * ApplicationStatusBarArea.tsx
 * アプリケーション全体の最下段に常時表示されるステータスバー。
 * 左: テキスト入力欄（モードに応じた機能）
 * 右: モードアイコン群 + ユーティリティボタン
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Info, Highlighter, Keyboard, Terminal, BookA, Bell, X, Copyright, Monitor, Globe } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { StorageManager } from '../../services/storage/StorageManager';
import { TTApplication } from '../../views/TTApplication';
import { getFocusName } from '../../utils/getFocusName';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import copywriteRaw from '../../../copyright.txt?raw';
import './ApplicationStatusBarArea.css';

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

const TOOLBAR_TO_MODE: Record<string, ToolMode> = Object.fromEntries(
  MODES.map(m => [m.label, m.id])
) as Record<string, ToolMode>;

const MODE_TO_TOOLBAR: Record<ToolMode, string> = Object.fromEntries(
  MODES.map(m => [m.id, m.label])
) as Record<ToolMode, string>;

interface Props {
  panel: TTWorkoutPanel;
}

export function ApplicationStatusBarArea({ panel }: Props) {
  useAppUpdate(panel);
  const status = TTApplication.Instance.Status;
  useAppUpdate(status);

  const [mode,        setMode]        = useState<ToolMode>(() => TOOLBAR_TO_MODE[panel.ToolBarMode] ?? 'highlight');
  const [text,        setText]        = useState(() => panel.HighlightWord);
  const [authorState, setAuthorState] = useState<AuthorState>(() => panel.ToolBarMode === 'Copyright' ? 'static' : 'off');
  const [kaState,     setKaState]     = useState<KAState>(KA_INIT);
  const inputRef       = useRef<HTMLInputElement>(null);
  const rafRef         = useRef<number>(0);

  // panel.ToolBarMode 変化（外部からの設定変更）をローカル state に反映
  useEffect(() => {
    const tbm = panel.ToolBarMode;
    if (tbm === 'Copyright') {
      setAuthorState(s => s === 'off' ? 'static' : s);
    } else {
      const mapped = TOOLBAR_TO_MODE[tbm];
      if (mapped) {
        setMode(mapped);
        setAuthorState('off');
        if (mapped !== 'keyaction') {
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }
    }
  }, [panel.ToolBarMode]);

  useEffect(() => {
    if (mode === 'highlight') setText(panel.HighlightWord);
  }, [panel.HighlightWord, mode]);

  // ExMode: モディファイアキーがすべて離されたら自動クリア（常時監視）
  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (!status.ExMode) return;
      const anyModHeld = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
      if (!anyModHeld) status.ClearExMode();
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, [status]);

  // KeyAction モード: window 全体のイベントをウォッチ
  // KeyAction / Status モード: window 全体のイベントをウォッチ
  useEffect(() => {
    if (mode !== 'keyaction' && mode !== 'status') { setKaState(KA_INIT); return; }

    const onKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'keyaction') return;
      const mods = [
        e.ctrlKey  && 'Ctrl',
        e.altKey   && 'Alt',
        e.shiftKey && 'Shift',
        e.metaKey  && 'Meta',
      ].filter(Boolean).join('+') || '-';
      const k = e.key === ' ' ? 'Space' : (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      setKaState(s => ({ ...s, modifiers: mods, key: k }));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (mode !== 'keyaction') return;
      // 離した後に残っているモディファイアキーを再計算、KEYはクリア
      const mods = [
        e.ctrlKey  && 'Ctrl',
        e.altKey   && 'Alt',
        e.shiftKey && 'Shift',
        e.metaKey  && 'Meta',
      ].filter(Boolean).join('+') || '-';
      setKaState(s => ({ ...s, modifiers: mods, key: '-' }));
    };

    const onMouse = (e: MouseEvent) => {
      if (mode !== 'keyaction') return;
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
      if (mode !== 'keyaction') return;
      const count = e.type === 'touchend' ? e.changedTouches.length : e.touches.length;
      setKaState(s => ({ ...s, touch: `${e.type}(${count})` }));
    };

    const onFocusIn = () => {
      // rAF でReact再描画後に判定（リボンボタン等のクリック直後にモードが確定する）
      requestAnimationFrame(() => {
        setKaState(s => ({ ...s, focus: getFocusName(document.activeElement) }));
      });
    };
    const onWindowBlur = () => {
      setKaState(s => ({ ...s, focus: '-' }));
    };

    // 初期フォーカス
    setKaState(s => ({ ...s, focus: getFocusName(document.activeElement) }));

    if (mode === 'keyaction') {
      window.addEventListener('keydown',    onKeyDown, { capture: true });
      window.addEventListener('keyup',      onKeyUp,   { capture: true });
      window.addEventListener('mousedown',  onMouse);
      window.addEventListener('mouseup',    onMouse);
      window.addEventListener('click',      onMouse);
      window.addEventListener('mousemove',  onMouse, { passive: true });
      window.addEventListener('touchstart', onTouch, { passive: true });
      window.addEventListener('touchmove',  onTouch, { passive: true });
      window.addEventListener('touchend',   onTouch, { passive: true });
    }
    window.addEventListener('focusin',    onFocusIn);
    window.addEventListener('blur',       onWindowBlur);

    return () => {
      if (mode === 'keyaction') {
        window.removeEventListener('keydown',    onKeyDown, { capture: true });
        window.removeEventListener('keyup',      onKeyUp,   { capture: true });
        window.removeEventListener('mousedown',  onMouse);
        window.removeEventListener('mouseup',    onMouse);
        window.removeEventListener('click',      onMouse);
        window.removeEventListener('mousemove',  onMouse);
        window.removeEventListener('touchstart', onTouch);
        window.removeEventListener('touchmove',  onTouch);
        window.removeEventListener('touchend',   onTouch);
      }
      window.removeEventListener('focusin',    onFocusIn);
      window.removeEventListener('blur',       onWindowBlur);
      cancelAnimationFrame(rafRef.current);
    };
  }, [mode]);

  const handleAuthorToggle = useCallback(() => {
    const next: AuthorState = authorState === 'off' ? 'banner' : 'off';
    panel.ToolBarMode = next !== 'off' ? 'Copyright' : MODE_TO_TOOLBAR[mode] ?? 'Highlighter';
    panel.NotifyUpdated(false);
    setAuthorState(next);
  }, [authorState, mode, panel]);

  const handleBannerClick = useCallback(() => {
    setAuthorState('static');
    panel.ToolBarMode = 'Copyright';
    panel.NotifyUpdated(false);
  }, [panel]);

  const handleModeSelect = useCallback((m: ToolMode) => {
    setMode(m);
    setAuthorState('off');
    setText(m === 'highlight' ? panel.HighlightWord : '');
    inputRef.current?.focus();
    panel.ToolBarMode = MODE_TO_TOOLBAR[m] ?? 'Highlighter';
    panel.NotifyUpdated(false);
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

  const storageMode = StorageManager.instance.mode;
  const isLocalMode = storageMode === 'electron' || storageMode === 'local';

  return (
    <div className="ApplicationStatusBarArea">

      {/* 起動モードインジケータ */}
      <div
        id="StatusBarModeIndicator"
        className="ApplicationStatusBarArea__mode-indicator"
        data-tip={isLocalMode ? '起動モード: Local' : '起動モード: Online'}
      >
        {isLocalMode ? <Monitor size={14} /> : <Globe size={14} />}
      </div>
      <div className="ApplicationStatusBarArea__indicator-divider" />

      {/* 作成者バナー / 作成者静的表示 / 通常入力欄 */}
      {authorState === 'banner' ? (
        <div
          className="ApplicationStatusBarArea__author-banner"
          onClick={handleBannerClick}
          title="クリックで静的表示"
        >
          <span className="ApplicationStatusBarArea__author-banner-text">
            {AUTHOR_BANNER_TEXT}
          </span>
        </div>
      ) : mode === 'keyaction' && authorState === 'off' ? (
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
            <span className={`ApplicationStatusBarArea__ka-value${status.ExMode ? ' ApplicationStatusBarArea__ka-value--exmode' : ''}`}>
              {status.ExMode || '-'}
            </span>
          </span>
          {status.ExMode && (
            <>
              <span className="ApplicationStatusBarArea__ka-sep">·</span>
              <span className="ApplicationStatusBarArea__ka-field">
                <span className="ApplicationStatusBarArea__ka-label">exmod</span>
                <span className="ApplicationStatusBarArea__ka-value">{status.ExModeModKey}</span>
              </span>
            </>
          )}
          <span className="ApplicationStatusBarArea__ka-divider" />
          <span className="ApplicationStatusBarArea__ka-field">
            <span className="ApplicationStatusBarArea__ka-label">action</span>
            <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--action">{status.LastActionDisplay || '-'}</span>
          </span>
        </div>
      ) : mode === 'status' && authorState === 'off' ? (
        <div className="ApplicationStatusBarArea__keyaction">
          <span className="ApplicationStatusBarArea__ka-field">
            <span className="ApplicationStatusBarArea__ka-label">focus</span>
            <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--focus">{kaState.focus}</span>
          </span>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            id="StatusBarTextInput"
            className="ApplicationStatusBarArea__input"
            type="text"
            value={authorState === 'static' ? AUTHOR_BANNER_TEXT : text}
            readOnly={authorState === 'static'}
            list={authorState === 'off' && mode === 'highlight' ? 'status-bar-highlight-history' : undefined}
            onChange={e => handleTextChange(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={current.placeholder}
            spellCheck={false}
          />
          {authorState === 'off' && mode === 'highlight' && (
            <datalist id="status-bar-highlight-history">
              {panel.HighlightHistory.map((h: string, i: number) => (
                <option key={i} value={h} />
              ))}
            </datalist>
          )}
          {authorState === 'off' && text && (
            <button
              className="ApplicationStatusBarArea__clear-btn"
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
      <div className="ApplicationStatusBarArea__modes">
        {MODES.map(m => (
          <button
            key={m.id}
            id={`StatusBarModeButton${m.id}`}
            className={`ApplicationStatusBarArea__mode-btn${!isAuthorOn && mode === m.id ? ' ApplicationStatusBarArea__mode-btn--active' : ''}`}
            onClick={() => handleModeSelect(m.id)}
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
          onClick={handleAuthorToggle}
          data-tip="Copyright"
          data-tip-side="left"
          aria-label="Copyright"
        >
          <Copyright size={14} />
        </button>
      </div>
    </div>
  );
}
