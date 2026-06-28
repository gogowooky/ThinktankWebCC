/**
 * ApplicationStatusBarArea.tsx
 * アプリケーション全体の最下段に常時表示されるステータスバー。
 * 左: テキスト入力欄や各種ステータス表示（モードに応じた機能）[Panels]
 * 右: モードアイコン群 + ユーティリティボタン [TabBar]
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Monitor, Globe } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { StorageManager } from '../../services/storage/StorageManager';
import { TTApplication } from '../../views/TTApplication';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { TTShortcutManager } from '../../views/TTShortcutManager';
import { getFocusName } from '../../utils/getFocusName';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import copywriteRaw from '../../../copyright.txt?raw';

// 下位コンポーネントおよび型のインポート
import {
  StatusBarAuthorBanner,
  StatusBarStatusPanel,
  StatusBarKeyActionPanel,
  StatusBarInputPanel,
  type KAState,
} from './StatusBarPanels';

import {
  StatusBarTabBar,
  MODES,
  TOOLBAR_TO_MODE,
  MODE_TO_TOOLBAR,
  type ToolMode,
} from './StatusBarTabBar';

import './ApplicationStatusBarArea.css';

const _cw = JSON.parse(copywriteRaw.replace(/^\uFEFF/, ''));
const AUTHOR_BANNER_TEXT = `${_cw.appName} ver.${_cw.version}, ${_cw.copyright.holder}(${_cw.copyright.year}). --- [${_cw.projectName}:${_cw.commitId}](${_cw.commitDateTime}) --- ${_cw.commitMessage}`;

type AuthorState = 'off' | 'banner' | 'static';

const KA_INIT: KAState = { modifiers: '-', key: '-', mouse: '-', touch: '-', focus: '-' };

interface Props {
  panel: TTWorkoutPanel;
}

export function ApplicationStatusBarArea({ panel }: Props) {
  useAppUpdate(panel);
  const status = TTApplication.Instance.Status;
  useAppUpdate(status);

  const [mode,        setMode]        = useState<ToolMode>(() => TOOLBAR_TO_MODE[panel.ToolBarMode] ?? 'highlight');
  const [text,        setText]        = useState(() => {
    const initMode = TOOLBAR_TO_MODE[panel.ToolBarMode] ?? 'highlight';
    if (initMode === 'highlight') return panel.HighlightWord;
    if (initMode === 'command') return panel.CommandText || '';
    if (initMode === 'translate') return panel.TranslateText || '';
    if (initMode === 'reminder') return panel.ReminderText || '';
    return '';
  });
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
    else if (mode === 'command') setText(panel.CommandText || '');
    else if (mode === 'translate') setText(panel.TranslateText || '');
    else if (mode === 'reminder') setText(panel.ReminderText || '');
  }, [panel.HighlightWord, panel.CommandText, panel.TranslateText, panel.ReminderText, mode]);

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

    // 初期フォーカス
    setKaState(s => ({ ...s, focus: TTUIStateManager.instance.getProperty('Application.FocusedArea.Name') || 'None' }));

    // UIStateManager のフォーカス変更をリッスンして同期
    const handleFocusChange = (key: string, value: string) => {
      setKaState(s => ({ ...s, focus: value }));
    };
    TTUIStateManager.instance.addListener('Application.FocusedArea.Name', handleFocusChange);

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
      TTUIStateManager.instance.removeListener('Application.FocusedArea.Name', handleFocusChange);
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
    let t = '';
    if (m === 'highlight') t = panel.HighlightWord;
    else if (m === 'command') t = panel.CommandText || '';
    else if (m === 'translate') t = panel.TranslateText || '';
    else if (m === 'reminder') t = panel.ReminderText || '';
    setText(t);
    inputRef.current?.focus();
    panel.ToolBarMode = MODE_TO_TOOLBAR[m] ?? 'Highlighter';
    panel.NotifyUpdated(false);
  }, [panel]);

  const handleTextChange = useCallback((v: string) => {
    setText(v);
    if (mode === 'highlight') panel.SetHighlightWord(v);
    else if (mode === 'command') panel.SetCommandText(v);
    else if (mode === 'translate') panel.SetTranslateText(v);
    else if (mode === 'reminder') panel.SetReminderText(v);
  }, [mode, panel]);

  const handleBlur = useCallback(() => {
    if (mode === 'highlight' && text.trim()) {
      panel.AddHighlightHistory(text.trim());
    }
  }, [mode, panel, text]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (mode === 'highlight' && text.trim()) {
        panel.AddHighlightHistory(text.trim());
      } else if (mode === 'command' && text.trim()) {
        TTShortcutManager.instance.executeActionDirect(text.trim());
      }
    }
  }, [mode, panel, text]);

  const handleClear = useCallback(() => {
    setText('');
    if (mode === 'highlight') panel.SetHighlightWord('');
    else if (mode === 'command') panel.SetCommandText('');
    else if (mode === 'translate') panel.SetTranslateText('');
    else if (mode === 'reminder') panel.SetReminderText('');
  }, [mode, panel]);

  const current = MODES.find(m => m.id === mode)!;
  const isAuthorOn = authorState !== 'off';

  const storageMode = StorageManager.instance.mode;
  const isLocalMode = storageMode === 'electron' || storageMode === 'local';

  // 左側コンテンツパネルの出し分け
  const renderPanel = () => {
    if (authorState === 'banner') {
      return (
        <StatusBarAuthorBanner
          bannerText={AUTHOR_BANNER_TEXT}
          onClick={handleBannerClick}
        />
      );
    }

    if (authorState === 'off') {
      if (mode === 'keyaction') {
        return (
          <StatusBarKeyActionPanel
            kaState={kaState}
            exMode={status.ExMode}
            exModeModKey={status.ExModeModKey}
            lastActionDisplay={status.LastActionDisplay}
          />
        );
      }
      if (mode === 'status') {
        return <StatusBarStatusPanel focus={kaState.focus} />;
      }
    }

    // 通常の入力フィールド (Highlight, Command, Translate, Reminder 等、または Copyrightの静的表示)
    return (
      <StatusBarInputPanel
        inputRef={inputRef}
        value={authorState === 'static' ? AUTHOR_BANNER_TEXT : text}
        onChange={handleTextChange}
        onClear={handleClear}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={current.placeholder}
        isReadOnly={authorState === 'static'}
        showHistory={authorState === 'off' && mode === 'highlight'}
        historyList={panel.HighlightHistory}
      />
    );
  };

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

      {/* 左側コンテンツパネル領域 */}
      {renderPanel()}

      {/* 右側タブバー領域 */}
      <StatusBarTabBar
        mode={mode}
        isAuthorOn={isAuthorOn}
        onModeSelect={handleModeSelect}
        onAuthorToggle={handleAuthorToggle}
      />

    </div>
  );
}
