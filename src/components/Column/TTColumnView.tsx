import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TTColumn } from '../../views/TTColumn';
import { TTApplication } from '../../views/TTApplication';
import { TTDataItem } from '../../models/TTDataItem';
import { TTModels } from '../../models/TTModels';
import { TTState } from '../../models/TTState';
import { Splitter } from '../Layout/Splitter';
import { DataGridPanel } from '../DataGrid/DataGridPanel';
import { TextEditorPanel } from '../TextEditor/TextEditorPanel';
import { WebViewPanel } from '../WebView/WebViewPanel';
import { KEYWORD_COLORS } from '../../utils/editorHighlight';
import { highlightTextSpans } from '../../utils/highlightSpans';
import { toFullUrl, buildMarkdownUrl, parseViewUrl } from '../../utils/webviewUrl';
import { markdownToHtml } from '../../utils/markdownToHtml';
import { obsidianService, OBSIDIAN_DEFAULT_URL } from '../../services/ObsidianService';
import { storageManager } from '../../services/storage/StorageManager';
import type { PanelType, HighlightTargets } from '../../types';
import './TTColumnView.css';

const HISTORY_MAX = 10;

function useLocalStorageHistory(key: string, maxItems: number = HISTORY_MAX) {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : [];
    } catch {
      return [];
    }
  });

  const addHistory = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setHistory(prev => {
      const next = [trimmed, ...prev.filter(v => v !== trimmed)].slice(0, maxItems);
      window.localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key, maxItems]);

  return [history, addHistory] as const;
}

function HistoryDropdown({
  anchorEl,
  history,
  activeIndex,
  onSelect,
}: {
  anchorEl: HTMLElement | null;
  history: string[];
  activeIndex: number;
  onSelect: (item: string) => void;
}) {
  if (history.length === 0 || !anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  return createPortal(
    <div
      className="history-dropdown"
      style={{ position: 'fixed', top: rect.bottom, left: rect.left, width: rect.width }}
    >
      {history.map((h, i) => (
        <div
          key={h}
          className={`history-dropdown-item${i === activeIndex ? ' history-dropdown-item-active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(h);
          }}
        >
          {h}
        </div>
      ))}
    </div>,
    document.body
  );
}

function HistoryInput({
  className, placeholder, value, onChange, onMouseDown, historyKey, onSend
}: {
  className: string; placeholder: string; value: string;
  onChange: (v: string) => void; onMouseDown: (e: React.MouseEvent) => void;
  historyKey: string; onSend?: (value: string) => void;
}) {
  const [history, addHistory] = useLocalStorageHistory(historyKey, HISTORY_MAX);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = useCallback((item: string) => {
    onChange(item);
    addHistory(item);
    setOpen(false);
    setActiveIndex(-1);
    setTimeout(() => inputRef.current?.blur(), 0);
  }, [onChange, addHistory]);

  return (
    <div className="history-input-wrapper">
      <input
        ref={inputRef}
        className={className}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={onMouseDown}
        onFocus={() => { setOpen(true); setActiveIndex(-1); }}
        onBlur={(e) => {
          addHistory(e.target.value);
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, history.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, -1));
          } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < history.length) {
              handleSelect(history[activeIndex]);
            } else if (onSend) {
              addHistory(e.currentTarget.value);
              onSend(e.currentTarget.value);
              onChange('');
              setOpen(false);
              setActiveIndex(-1);
            } else {
              addHistory(e.currentTarget.value);
              setOpen(false);
              e.currentTarget.blur();
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
            setActiveIndex(-1);
            e.currentTarget.blur();
          }
        }}
      />
      {open && (
        <HistoryDropdown anchorEl={inputRef.current} history={history} activeIndex={activeIndex} onSelect={handleSelect} />
      )}
    </div>
  );
}

/** AssistBar で使用可能なコマンド一覧 */
const ASSIST_COMMANDS: { command: string; description: string }[] = [
  { command: '/Chat [text]',        description: 'AIとのチャットモードに入る' },
  { command: '/CheckList',          description: 'チェック済みアイテムの一覧を作成' },
  { command: '/Search <keywords>',  description: 'チェック済みアイテムを全文検索' },
  { command: '/Status',             description: '全TTStateの状態一覧をnoteに表示' },
  { command: '/Markdown [id]',      description: 'MarkdownをWebViewにHTML表示' },
  { command: '/SyncObsidian',            description: 'Obsidian Vault を obsidian 種別として同期' },
  { command: '/SyncObsidian set <token> [url]', description: 'Obsidian API のトークン（と URL）を設定' },
];

/** AssistBar 専用入力
 * - 空文字フォーカス時 → コマンド履歴ドロップダウン
 * - '/' 始まり入力時  → コマンド一覧ドロップダウン
 * - 送信後            → 入力テキストを残す
 */
function CommandInput({
  className, placeholder, value, onChange, onMouseDown, onSend
}: {
  className: string; placeholder: string; value: string;
  onChange: (v: string) => void; onMouseDown: (e: React.MouseEvent) => void;
  onSend?: (value: string) => void;
}) {
  const [history, addHistory] = useLocalStorageHistory('thinktank-history-assist', HISTORY_MAX);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // モード判定
  const showCommands = value.startsWith('/');
  const showHistory  = !value && history.length > 0;

  const commandFiltered = showCommands
    ? ASSIST_COMMANDS.filter(c => c.command.toLowerCase().startsWith(value.toLowerCase()))
    : [];

  // ↑↓ で走査するリストの長さ
  const activeListLen = showCommands ? commandFiltered.length : showHistory ? history.length : 0;

  const handleSelectCommand = useCallback((cmd: string) => {
    onChange(cmd);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, [onChange]);

  const handleSelectHistory = useCallback((item: string) => {
    onChange(item);
    setOpen(false);
    setActiveIndex(-1);
  }, [onChange]);

  const rect = inputRef.current?.getBoundingClientRect();

  return (
    <div className="history-input-wrapper">
      <input
        ref={inputRef}
        className={className}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setActiveIndex(-1); }}
        onMouseDown={onMouseDown}
        onFocus={() => { setOpen(true); setActiveIndex(-1); }}
        onBlur={(e) => {
          if (e.target.value) addHistory(e.target.value);
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, activeListLen - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, -1));
          } else if (e.key === 'Enter') {
            if (activeIndex >= 0) {
              if (showCommands && commandFiltered[activeIndex]) {
                handleSelectCommand(commandFiltered[activeIndex].command);
              } else if (showHistory && history[activeIndex]) {
                handleSelectHistory(history[activeIndex]);
              }
            } else if (onSend) {
              const v = e.currentTarget.value;
              if (v) addHistory(v);
              onSend(v);
              // 入力テキストは消去しない
              setOpen(false);
              setActiveIndex(-1);
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
            setActiveIndex(-1);
            e.currentTarget.blur();
          }
        }}
      />
      {open && rect && (
        <>
          {/* '/' 始まり → コマンド一覧 */}
          {showCommands && commandFiltered.length > 0 && createPortal(
            <div className="history-dropdown" style={{ position: 'fixed', top: rect.bottom, left: rect.left, width: rect.width }}>
              {commandFiltered.map((c, i) => (
                <div
                  key={c.command}
                  className={`history-dropdown-item command-dropdown-item${i === activeIndex ? ' history-dropdown-item-active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); handleSelectCommand(c.command); }}
                >
                  <span className="command-dropdown-name">{c.command}</span>
                  <span className="command-dropdown-desc">{c.description}</span>
                </div>
              ))}
            </div>,
            document.body
          )}
          {/* 空文字 → コマンド履歴 */}
          {showHistory && createPortal(
            <div className="history-dropdown" style={{ position: 'fixed', top: rect.bottom, left: rect.left, width: rect.width }}>
              {history.map((h, i) => (
                <div
                  key={h}
                  className={`history-dropdown-item${i === activeIndex ? ' history-dropdown-item-active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); handleSelectHistory(h); }}
                >
                  {h}
                </div>
              ))}
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}

/**
 * キーワード入力コンポーネント
 * - 編集時: 通常の <input>（自由にどこでも編集可能）
 * - 表示時: 各カンマ区切り語をTextEditorと同じ色付き背景スパンで表示
 */
function KeywordTagInput({ value, onChange, onFocusPanel }: { value: string; onChange: (v: string) => void, onFocusPanel: () => void }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [history, addHistory] = useLocalStorageHistory('thinktank-history-texteditor', HISTORY_MAX);

  const handleSelect = useCallback((item: string) => {
    onChange(item);
    addHistory(item);
    setOpen(false);
    setActiveIndex(-1);
    setEditing(false);
    setTimeout(() => inputRef.current?.blur(), 0);
  }, [onChange, addHistory]);

  // 表示モード: 値あり かつ 非編集中
  if (!editing && value.trim()) {
    return (
      <div
        className="panel-toolbar-input keyword-highlight-display"
        title={value}
        onClick={() => {
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onFocusPanel();
        }}
      >
        {value.split(',').map((part, gi) => {
          const trimmed = part.trim();
          if (!trimmed) return null;
          const color = KEYWORD_COLORS[gi % KEYWORD_COLORS.length];
          return (
            <span key={gi} className="keyword-highlight-word" style={{ backgroundColor: color }}>
              {trimmed}
            </span>
          );
        })}
      </div>
    );
  }

  // 編集モード: 通常の input + カスタムドロップダウン
  return (
    <div className="history-input-wrapper">
      <input
        ref={inputRef}
        className="panel-toolbar-input"
        type="text"
        placeholder="Highlight..."
        value={value}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={editing}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { setEditing(true); setOpen(true); setActiveIndex(-1); }}
        onBlur={(e) => {
          addHistory(e.target.value);
          setEditing(false);
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, history.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, -1));
          } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < history.length) {
              handleSelect(history[activeIndex]);
            } else {
              addHistory(e.currentTarget.value);
              setOpen(false);
              e.currentTarget.blur();
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
            setActiveIndex(-1);
            e.currentTarget.blur();
          }
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onFocusPanel();
        }}
      />
      {open && (
        <HistoryDropdown anchorEl={inputRef.current} history={history} activeIndex={activeIndex} onSelect={handleSelect} />
      )}
    </div>
  );
}

/** ハイライト適用対象トグルボタンの定義 */
const HL_TARGET_DEFS: { key: keyof HighlightTargets; label: string; title: string }[] = [
  { key: 'panelTitle', label: 'T', title: 'パネルタイトルをハイライト' },
  { key: 'dataGrid',   label: 'G', title: 'DataGrid本体をハイライト' },
  { key: 'webView',    label: 'W', title: 'WebView本体をハイライト' },
];

/**
 * TTColumnView - 1列分のUIコンポーネント
 *
 * 縦にDataGridPanel / WebViewPanel / TextEditorPanelを配置。
 * 各パネルにタイトルバー+ツールバーあり。フォーカス中のパネルには ● マーク。
 * パネル間にSplitterを設置し、ドラッグで高さ比率を変更可能。
 * Splitterはパネルを完全に隠す（タイトルバー・ツールバーも含め）まで移動可能。
 */

interface TTColumnViewProps {
  column: TTColumn;
  width: number;
  height: number;
}

/** HTML エスケープ */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** ポップアップウィンドウ用 CSS（WebView と同等のスタイル） */
const POPUP_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #1e1e1e; color: #ccc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px; line-height: 1.7;
  padding: 24px 32px; max-width: 900px; margin: 0 auto;
}
h1, h2, h3, h4, h5, h6 { color: #e0e0e0; margin: 1em 0 0.4em; }
h1 { font-size: 1.6em; border-bottom: 1px solid #444; padding-bottom: 6px; }
h2 { font-size: 1.3em; border-bottom: 1px solid #333; padding-bottom: 4px; }
h3 { font-size: 1.15em; }
p { margin: 0.5em 0; }
ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
li { margin: 0.2em 0; }
code { background: #2d2d30; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; font-family: 'Fira Code', monospace; }
pre { background: #2d2d30; padding: 12px; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
a { color: #4fc1ff; text-decoration: none; }
a:hover { text-decoration: underline; }
hr { border: none; border-top: 1px solid #444; margin: 1em 0; }
strong { color: #e0e0e0; }
blockquote { border-left: 3px solid #555; padding-left: 12px; color: #aaa; margin: 0.5em 0; }
table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
th, td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
th { background: #2d2d30; }
.chat-user { color: #4fc1ff; margin: 0.8em 0 0.3em; font-weight: bold; }
.chat-assistant { margin: 0.3em 0 0.8em; padding-left: 12px; border-left: 2px solid #555; }
`;

function openHtmlInNewWindow(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(
    `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>` +
    `<style>${POPUP_CSS}</style></head><body>${bodyHtml}</body></html>`
  );
  win.document.close();
}

/** タイトルバー（タイトル行 + ツールバー + border）の概算高さ */
const TITLEBAR_TOTAL = 40;

const PANEL_TITLES: Record<PanelType, string> = {
  DataGrid: 'DataGrid',
  WebView: 'WebView',
  TextEditor: 'TextEditor',
};

function loadPanelRatios(column: TTColumn): [number, number, number] {
  try {
    const key = `thinktank-col-${column.Index}-panel-ratios`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved) as number[];
      if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(v => typeof v === 'number' && v >= 0)) {
        column.VerticalRatios = [parsed[0], parsed[1], parsed[2]];
        return [parsed[0], parsed[1], parsed[2]];
      }
    }
  } catch { /* ignore */ }
  return [...column.VerticalRatios] as [number, number, number];
}

export function TTColumnView({ column, width, height }: TTColumnViewProps) {
  const [ratios, setRatios] = useState<[number, number, number]>(
    () => loadPanelRatios(column)
  );
  const ratiosRef = useRef(ratios);
  ratiosRef.current = ratios;

  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    const colKey = `TTColumnView-${column.Index}`;
    const appKey = `TTColumnView-app-${column.Index}`;
    column.AddOnUpdate(colKey, rerender);
    TTApplication.Instance.AddOnUpdate(appKey, rerender);
    return () => {
      column.RemoveOnUpdate(colKey);
      TTApplication.Instance.RemoveOnUpdate(appKey);
    };
  }, [column, rerender]);

  const handleVerticalResize = useCallback((splitterIndex: 0 | 1, deltaPx: number) => {
    // Splitter2本分(8px)だけ固定、残り全体を比率分割
    const totalHeight = height - 8;
    if (totalHeight <= 0) return;

    const deltaRatio = deltaPx / totalHeight;
    const r = [...ratiosRef.current] as [number, number, number];

    const upper = splitterIndex;
    const lower = splitterIndex + 1;

    let newUpper = r[upper] + deltaRatio;
    let newLower = r[lower] - deltaRatio;

    if (newUpper < 0) {
      newLower += newUpper;
      newUpper = 0;
    }
    if (newLower < 0) {
      newUpper += newLower;
      newLower = 0;
    }
    if (newUpper < 0 || newLower < 0) return;

    r[upper] = newUpper;
    r[lower] = newLower;

    column.VerticalRatios = r;
    setRatios(r);
    try {
      localStorage.setItem(`thinktank-col-${column.Index}-panel-ratios`, JSON.stringify(r));
    } catch { /* ignore */ }
  }, [column, height]);

  const handlePanelFocus = useCallback((panel: PanelType) => {
    const app = TTApplication.Instance;
    app.ActiveColumnIndex = column.Index;
    column.FocusedPanel = panel; // FocusedTool は setter 内で 'Main' にリセット
  }, [column]);

  const handleToolFocus = useCallback((panel: PanelType) => {
    const app = TTApplication.Instance;
    app.ActiveColumnIndex = column.Index;
    column.FocusedPanel = panel;
    column.FocusedTool = 'Tool';
  }, [column]);

  /** 表示アイテムの全チェック/全解除トグル */
  const handleToggleAllDisplayedCheck = useCallback(() => {
    const displayedIds = column.GetDisplayedItemIds();
    const allChecked = displayedIds.length > 0 && displayedIds.every(id => column.CheckedItemIDs.has(id));
    column.setAllChecked(displayedIds, !allChecked);
  }, [column]);

  /**
   * WebView の ↗ ボタン: クライアント側データを使って新しいウィンドウで表示
   * - /view/markdown → IndexedDB のアイテム内容を marked でレンダリング
   * - ChatMode (URL なし) → 現在のチャットメッセージを HTML 化
   * - その他 URL → 通常の window.open
   */
  const handleOpenInBrowser = useCallback(() => {
    const url = column.WebViewUrl.trim();

    // /view/markdown → IndexedDB から直接レンダリング（BigQuery 経由せず）
    if (url.startsWith('/view/markdown')) {
      const route = parseViewUrl(url);
      const id = route?.params.id ?? '';
      const item = column.GetCurrentCollection()?.GetDataItem(id);
      if (item) {
        const doOpen = async () => {
          if (!item.IsLoaded) await item.LoadContent().catch(() => {});
          openHtmlInNewWindow(item.Name + ' - Thinktank', markdownToHtml(item.Content));
        };
        doOpen();
        return;
      }
    }

    // ChatMode（URL なし）→ チャットメッセージを HTML として開く
    if (column.ChatMode && !url) {
      const messages = column.ChatMessages.filter(m => !m.isStreaming);
      if (messages.length === 0) return;
      const parts = messages.map(m => {
        if (m.role === 'user') {
          return `<p class="chat-user">&gt; ${escapeHtml(m.content)}</p>`;
        }
        return `<div class="chat-assistant">${markdownToHtml(m.content || '')}</div>`;
      });
      const firstUser = messages.find(m => m.role === 'user')?.content ?? 'Chat';
      openHtmlInNewWindow(`${firstUser} - Thinktank`, parts.join('\n'));
      return;
    }

    // その他 URL（外部 URL など）
    if (url) window.open(toFullUrl(url), '_blank');
  }, [column]);

  /**
   * /Markdown コマンド処理
   * 指定IDのMarkdownをWebViewにHTML表示する。
   * ID未指定時はTextEditorの表示アイテムを使用。
   */
  const handleBrowseMarkdown = useCallback((idStr: string) => {
    const collection = column.GetCurrentCollection();
    if (!collection) return;

    const ids = idStr.split(/\s+/).filter(Boolean);
    const targetId = ids.length > 0 ? ids[0] : column.EditorResource;
    if (!targetId) return;

    const item = collection.GetDataItem(targetId);
    if (!item) return;

    const category = item.CollectionID || column.DataGridResource || 'Knowledge';
    column.WebViewUrl = buildMarkdownUrl(category, targetId);
  }, [column]);

  /**
   * /CheckList コマンド処理
   * チェック済みアイテム一覧を note 種別の TTDataItem として作成・保存し、
   * TextEditor に表示する。
   */
  const handleSelectToNote = useCallback(async () => {
    const collection = column.GetCurrentCollection();
    if (!collection) return;

    const checkedIds = column.CheckedItemIDs;
    if (checkedIds.size === 0) return;

    // チェック済みアイテムをコレクションの順序で取得
    const checkedItems = collection.GetDataItems().filter(item => checkedIds.has(item.ID));
    const count = checkedItems.length;

    // ノートコンテンツを構築
    const SEP = 'ーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーー';
    const firstTitle = checkedItems[0]?.Name ?? '';
    const lines: string[] = [];
    lines.push(`CheckList (${count}) | 例：${firstTitle}`);
    lines.push(SEP);
    lines.push('ID | 更新日 | タイトル');
    lines.push(SEP);
    for (const item of checkedItems) {
      lines.push(`${item.ID} | ${item.UpdateDate} | ${item.Name}`);
      lines.push(SEP);
    }
    const content = lines.join('\n');

    // CollectionID を決定: 既存 note/memo アイテムの CollectionID を優先、
    // なければコレクションの最初のカテゴリを使用
    const existingNote = collection.GetDataItems().find(
      item => item.ContentType === 'note' || item.ContentType === 'memo'
    );
    const collectionId =
      existingNote?.CollectionID ||
      collection.HandledCategories[0] ||
      collection.DatabaseID ||
      collection.ID;

    // 新しい TTDataItem (note) を作成
    const newItem = new TTDataItem();
    newItem.ContentType = 'note';
    newItem.CollectionID = collectionId;
    newItem.Content = content; // Name も先頭行から自動設定される

    // コレクションに追加して BQ へ保存
    collection.AddItem(newItem);
    await newItem.SaveContent();

    // TextEditor に表示
    column.SelectedItemID = newItem.ID;
  }, [column]);

  /**
   * /Search コマンド処理
   * チェック済みアイテムを対象に全文検索し、ヒット一覧を note として保存・表示する。
   */
  const handleCreateSearchList = useCallback(async (keywordStr: string) => {
    const collection = column.GetCurrentCollection();
    if (!collection) return;

    const keywords = keywordStr.split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return;

    const checkedIds = column.CheckedItemIDs;
    const checkedItems = collection.GetDataItems().filter(item => checkedIds.has(item.ID));
    const totalCount = checkedItems.length;

    // 未ロードのアイテムのコンテンツを一括ロード
    await Promise.all(
      checkedItems.filter(item => !item.IsLoaded).map(item => item.LoadContent())
    );

    // 全文検索（全キーワードの AND マッチ）
    type HitResult = { item: TTDataItem; snippet: string };
    const hits: HitResult[] = [];
    const kwsLower = keywords.map(k => k.toLowerCase());

    for (const item of checkedItems) {
      const contentLower = item.Content.toLowerCase();
      if (!kwsLower.every(kw => contentLower.includes(kw))) continue;

      // 最初にマッチしたキーワードの周辺をスニペットとして抽出
      const pos = contentLower.indexOf(kwsLower[0]);
      const start = Math.max(0, pos - 50);
      const end = Math.min(item.Content.length, pos + kwsLower[0].length + 100);
      let snippet = item.Content.slice(start, end).replace(/\r?\n/g, ' ').trim();
      if (start > 0) snippet = '...' + snippet;
      if (end < item.Content.length) snippet += '...';

      hits.push({ item, snippet });
    }

    const hitCount = hits.length;
    const keywordLabel = keywords.join(' ');

    // ノートコンテンツを構築
    const SEP = 'ーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーー';
    const lines: string[] = [];
    lines.push(`Search (${hitCount}/${totalCount}) | ${keywordLabel}`);
    lines.push(SEP);
    lines.push('ID | 更新日 | タイトル');
    lines.push(SEP);
    for (const { item, snippet } of hits) {
      lines.push(`${item.ID} | ${item.UpdateDate} | ${item.Name}`);
      lines.push(`スニペット: ${snippet}`);
      lines.push(SEP);
    }
    const content = lines.join('\n');

    // CollectionID を決定
    const existingNote = collection.GetDataItems().find(
      item => item.ContentType === 'note' || item.ContentType === 'memo'
    );
    const collectionId =
      existingNote?.CollectionID ||
      collection.HandledCategories[0] ||
      collection.DatabaseID ||
      collection.ID;

    // 新しい TTDataItem (note) を作成・保存
    const newItem = new TTDataItem();
    newItem.ContentType = 'note';
    newItem.CollectionID = collectionId;
    newItem.Content = content;

    collection.AddItem(newItem);
    await newItem.SaveContent();

    // TextEditor に表示
    column.SelectedItemID = newItem.ID;
  }, [column]);

  /**
   * /Status コマンド処理
   * 全 TTState の状態一覧を note として保存・表示する。
   */
  const handleCreateStatusNote = useCallback(async () => {
    const collection = column.GetCurrentCollection();
    if (!collection) return;

    const states = TTModels.Instance.Status.GetItems()
      .filter((item): item is TTState => item instanceof TTState);

    // カラム幅を固定して整形
    const COL = { id: 30, val: 18, def: 18 };
    const pad = (s: string, n: number) => s.length >= n ? s.slice(0, n - 1) + ' ' : s.padEnd(n);

    const header = pad('StateID', COL.id) + pad('StateValue', COL.val) + pad('StateDefault', COL.def) + 'StateName';
    const sep    = '-'.repeat(COL.id + COL.val + COL.def + 40);

    const rows = states.map(st =>
      pad(st.ID, COL.id) + pad(st.Value, COL.val) + pad(st.DefaultValue, COL.def) + st.Description
    );

    const content = ['TTState', header, sep, ...rows].join('\n');

    // note アイテムを作成・保存
    const existingNote = collection.GetDataItems().find(
      item => item.ContentType === 'note' || item.ContentType === 'memo'
    );
    const collectionId =
      existingNote?.CollectionID ||
      collection.HandledCategories[0] ||
      collection.DatabaseID ||
      collection.ID;

    const newItem = new TTDataItem();
    newItem.ContentType = 'note';
    newItem.CollectionID = collectionId;
    newItem.Content = content;

    collection.AddItem(newItem);
    await newItem.SaveContent();

    column.SelectedItemID = newItem.ID;
  }, [column]);

  /**
   * /SyncObsidian コマンド処理
   *
   * 引数なし            : Obsidian Local REST API で Vault を同期
   * set <token> [url]  : API トークン（と URL）を設定して同期
   *
   * Obsidian Local REST API プラグインが必要:
   *   https://github.com/coddingtonbear/obsidian-local-rest-api
   */
  const handleSyncObsidian = useCallback(async (args: string) => {
    const collection = column.GetCurrentCollection();
    if (!collection) return;

    const collectionId =
      collection.GetDataItems().find(it => it.ContentType === 'memo' || it.ContentType === 'note')?.CollectionID ||
      collection.HandledCategories[0] ||
      collection.DatabaseID ||
      collection.ID;

    const makeNote = (content: string) => {
      const item = new TTDataItem();
      item.ContentType = 'note';
      item.CollectionID = collectionId;
      item.Content = content;
      collection.AddItem(item);
      column.SelectedItemID = item.ID;
      return item;
    };

    // ── /SyncObsidian set <token> [url] ──────────────────────────────────────
    const setMatch = args.match(/^set\s+(\S+)(?:\s+(\S+))?$/i);
    if (setMatch) {
      const token = setMatch[1];
      const url   = setMatch[2] || OBSIDIAN_DEFAULT_URL;
      obsidianService.saveConfig(url, token);
      const note = makeNote(
        `# Obsidian API 設定完了\n\n- URL: \`${url}\`\n- Token: 設定済み\n\nそのまま同期を実行します…`
      );
      // 設定直後にそのまま同期実行
      await note.SaveContent();
      args = ''; // fall through to sync
    }

    // ── /SyncObsidian（同期） ────────────────────────────────────────────────
    const config = obsidianService.getConfig();
    if (!config) {
      makeNote([
        '# Obsidian API が未設定です',
        '',
        '以下のコマンドで API トークンを設定してください:',
        '',
        '```',
        '/SyncObsidian set <APIトークン>',
        '```',
        '',
        '`[url]` は省略可（デフォルト: `https://127.0.0.1:27123`）。',
        '',
        '## セットアップ手順',
        '1. Obsidian の Community Plugins から **Local REST API** をインストール',
        '2. プラグインの設定画面で **API Key** をコピー',
        '3. 上記コマンドを AssistBar で実行',
        '',
        '> **HTTPS 証明書について**',
        '> ブラウザで `https://127.0.0.1:27123` を一度開き、',
        '> 自己署名証明書を許可してから同期してください。',
      ].join('\n'));
      return;
    }

    // プログレス表示用の note を作成
    const resultItem = makeNote('# Obsidian 同期中...\n\nVault のファイルを確認しています。');

    try {
      // Vault → FileRecord 一覧を構築（差分のみ）
      const syncResult = await obsidianService.buildSyncRecords(
        (current, total) => {
          resultItem.Content = `# Obsidian 同期中...\n\n${current} / ${total} ファイル確認済み`;
        },
      );

      // IndexedDB へ保存 + TTKnowledge のインメモリコレクションへ即時反映
      const knowledge = TTModels.Instance.Knowledge;
      for (const record of syncResult.records) {
        await storageManager.saveFile(record);
        knowledge.AddOrUpdateFromRecord(record);
      }

      // 結果サマリーを表示
      const lines: string[] = [
        '# Obsidian 同期完了',
        '',
        `- 総ファイル数: ${syncResult.total}`,
        `- 新規/更新: ${syncResult.synced}`,
        `- 変更なし: ${syncResult.unchanged}`,
        `- API URL: \`${config.url}\``,
      ];
      if (syncResult.errors.length > 0) {
        lines.push('', '## エラー', ...syncResult.errors.map(e => `- ${e}`));
      }
      resultItem.Content = lines.join('\n');
      await resultItem.SaveContent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultItem.Content = [
        '# Obsidian 同期エラー',
        '',
        msg,
        '',
        '**接続できない場合のチェック:**',
        '- Obsidian が起動中か確認してください',
        '- Local REST API プラグインが有効か確認してください',
        `- ブラウザで \`${config.url}\` を開いて証明書を許可してください`,
      ].join('\n');
      await resultItem.SaveContent();
    }
  }, [column]);

  /** TextEditor 💬 ボタン: チャットモードに入る（コンテキストは初回送信時に自動添付） */
  const handleStartChat = useCallback(() => {
    column.enterChatMode();
  }, [column]);

  /**
   * チャット内容を chat 種別の TTDataItem として保存し、BQ へ送信する。
   */
  const handleSaveChatToKnowledge = useCallback(async () => {
    const messages = column.ChatMessages.filter(m => !m.isStreaming);
    if (messages.length === 0) return;

    const collection = column.GetCurrentCollection();
    if (!collection) return;

    const SEP = 'ーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーー';
    const firstUser = messages.find(m => m.role === 'user')?.content ?? '';
    const lines: string[] = [];
    lines.push(`Chat | ${firstUser}`);
    lines.push(SEP);
    for (const msg of messages) {
      if (msg.role === 'user') {
        lines.push(`> ${msg.content}`);
      } else {
        lines.push(msg.content || '');
      }
      lines.push(SEP);
    }
    const content = lines.join('\n');

    // CollectionID: chat 種別のアイテムを優先、なければ note/memo と同じカテゴリ
    const existingChat = collection.GetDataItems().find(it => it.ContentType === 'chat');
    const existingNote = collection.GetDataItems().find(
      it => it.ContentType === 'note' || it.ContentType === 'memo'
    );
    const collectionId =
      existingChat?.CollectionID ||
      existingNote?.CollectionID ||
      collection.HandledCategories[0] ||
      collection.DatabaseID ||
      collection.ID;

    const newItem = new TTDataItem();
    newItem.ContentType = 'chat';
    newItem.CollectionID = collectionId;
    newItem.Content = content;

    collection.AddItem(newItem);
    await newItem.SaveContent();

    column.SelectedItemID = newItem.ID;
  }, [column]);

  /**
   * 純粋なSSEチャット送信（スラッシュコマンド処理なし）
   * WebViewPanel の textarea からも呼ばれる。
   * 初回メッセージ時はチェック済みアイテム＋選択テキストを systemPrompt に添付。
   */
  const handleChatSend = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    // AssistBar をクリア（送信開始と同時に）
    column.ChatInput = '';

    // 初回メッセージ時にコンテキストを systemPrompt として構築
    const isFirst = column.ChatMessages.length === 0;
    let systemPrompt: string | undefined;
    if (isFirst) {
      const ctx = await column.buildChatContext();
      const parts: string[] = [];
      if (ctx.checkedItems.length > 0) {
        parts.push('## 参照アイテム（チェック済み）');
        for (const item of ctx.checkedItems) {
          parts.push(`### ${item.title} [${item.id}] (${item.contentType})\n${item.content}`);
        }
      }
      if (ctx.editorItem) {
        parts.push(`## TextEditorで表示中のアイテム\n### ${ctx.editorItem.title} [${ctx.editorItem.id}] (${ctx.editorItem.contentType})\n${ctx.editorItem.content}`);
      }
      if (ctx.selection) {
        parts.push(`## 選択テキスト\n${ctx.selection}`);
      }
      if (parts.length > 0) {
        systemPrompt = parts.join('\n\n');
      }
    }

    const history = column.ChatMessages.map(m => ({ role: m.role, content: m.content }));

    column.addChatMessage({ role: 'user', content: trimmed });
    column.addChatMessage({ role: 'assistant', content: '', isStreaming: true });

    try {
      const res = await fetch(`/api/chat/${column.ChatSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history,
          ...(systemPrompt ? { systemPrompt } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        column.updateLastAssistantMessage(`[Error ${res.status}]`, false);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      let buf = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6)) as { type: string; text: string };
            if (d.type === 'delta') { acc += d.text; column.updateLastAssistantMessage(acc, true); }
            else if (d.type === 'done') { column.updateLastAssistantMessage(d.text || acc, false); }
            else if (d.type === 'error') { column.updateLastAssistantMessage(`[Error] ${d.text}`, false); }
          } catch { /* ignore */ }
        }
      }
      column.updateLastAssistantMessage(acc, false);
    } catch (err) {
      column.updateLastAssistantMessage(`[Error] ${err instanceof Error ? err.message : String(err)}`, false);
    }
  }, [column]);

  /**
   * AssistBar から Enter 送信 → スラッシュコマンドルーティング
   * コマンド以外のテキストは自動でチャットモードに入り送信する。
   */
  const handleSendChat = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    const trimmedLower = trimmed.toLowerCase();

    if (trimmedLower === '/checklist') {
      await handleSelectToNote();
      return;
    }
    if (trimmedLower === '/status') {
      await handleCreateStatusNote();
      return;
    }
    if (trimmedLower.startsWith('/search')) {
      const rest = trimmed.slice('/Search'.length).trim();
      await handleCreateSearchList(rest);
      return;
    }
    if (trimmedLower.startsWith('/markdown')) {
      const rest = trimmed.slice('/Markdown'.length).trim();
      handleBrowseMarkdown(rest);
      return;
    }
    if (trimmedLower === '/chat') {
      column.enterChatMode();
      return;
    }
    if (trimmedLower.startsWith('/chat ')) {
      const rest = trimmed.slice(6).trim();
      column.enterChatMode();
      if (rest) await handleChatSend(rest);
      return;
    }
    if (trimmedLower.startsWith('/syncobsidian')) {
      const rest = trimmed.slice('/SyncObsidian'.length).trim();
      await handleSyncObsidian(rest);
      return;
    }

    // コマンド以外のテキスト → チャットモードに入り自動送信
    // すでにチャットモードの場合はリセットせずそのまま追加送信
    if (!trimmedLower.startsWith('/')) {
      if (!column.ChatMode) column.enterChatMode();
      await handleChatSend(trimmed);
      return;
    }

    // 未知のスラッシュコマンド → 無視
  }, [column, handleSelectToNote, handleCreateSearchList, handleCreateStatusNote, handleBrowseMarkdown, handleChatSend, handleSyncObsidian]);

  // Splitter2本(8px)のみ固定。残り全体を3パネルで比率分割
  const splitterTotal = 8;
  const availableHeight = Math.max(0, height - splitterTotal);

  const panelHeights = [
    Math.round(availableHeight * ratios[0]),
    Math.round(availableHeight * ratios[1]),
    Math.round(availableHeight * ratios[2]),
  ];
  const sum = panelHeights[0] + panelHeights[1] + panelHeights[2];
  panelHeights[2] += (availableHeight - sum);

  if (!column.IsVisible) return null;

  const app = TTApplication.Instance;
  const isActiveColumn = app.ActiveColumnIndex === column.Index;
  const focused = column.FocusedPanel;
  const panels: { type: PanelType; height: number; className: string }[] = [
    { type: 'DataGrid', height: panelHeights[0], className: 'panel-datagrid' },
    { type: 'TextEditor', height: panelHeights[1], className: 'panel-texteditor' },
    { type: 'WebView', height: panelHeights[2], className: 'panel-webview' },
  ];

  const elements: React.ReactNode[] = [];
  panels.forEach((panel, i) => {
    if (i > 0) {
      elements.push(
        <Splitter
          key={`splitter-${i}`}
          direction="vertical"
          onResize={(delta) => handleVerticalResize((i - 1) as 0 | 1, delta)}
        />
      );
    }

    const isFocused = isActiveColumn && focused === panel.type;
    const selectedId = column.SelectedItemID;
    const selectedItem = selectedId ? column.GetCurrentCollection()?.GetDataItem(selectedId) : null;
    const itemInfo = selectedItem ? ` | ${selectedItem.ID} | ${selectedItem.Name}` : '';
    const hlTargets = column.HighlightTargets;
    const hlKeyword = column.HighlighterKeyword;

    let titleNode: React.ReactNode;
    if (panel.type === 'WebView') {
      const lastMsg = column.LastUserMessage;
      const titleText = `${isFocused ? '● ' : ''}Assistant${lastMsg ? ` | ${lastMsg}` : ''}`;
      titleNode = (
        <>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hlTargets.panelTitle && hlKeyword ? highlightTextSpans(titleText, hlKeyword) : titleText}
          </span>
          {(column.WebViewUrl.trim() || column.ChatMode) && (
            <button
              className="panel-title-open-btn"
              title="Open in new window"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleOpenInBrowser}
            >
              &#x2197;
            </button>
          )}
        </>
      );
    } else if (panel.type === 'DataGrid') {
      const displayCount = column.GetDisplayItemCount();
      const totalCount = column.GetTotalItemCount();
      const titleText = `${isFocused ? '● ' : ''}All (${displayCount}/${totalCount})`;
      titleNode = (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hlTargets.panelTitle && hlKeyword ? highlightTextSpans(titleText, hlKeyword) : titleText}
        </span>
      );
    } else if (panel.type === 'TextEditor') {
      const contentType = selectedItem?.ContentType ?? '';
      const titleText = selectedItem
        ? `${isFocused ? '● ' : ''}${contentType} | ${selectedItem.ID} | ${selectedItem.Name}`
        : `${isFocused ? '● ' : ''}`;
      titleNode = (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hlTargets.panelTitle && hlKeyword ? highlightTextSpans(titleText, hlKeyword) : titleText}
        </span>
      );
    } else {
      const titleText = `${isFocused ? '● ' : ''}${PANEL_TITLES[panel.type]}${itemInfo}`;
      titleNode = (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hlTargets.panelTitle && hlKeyword ? highlightTextSpans(titleText, hlKeyword) : titleText}
        </span>
      );
    }

    const toolbarProps = {
      DataGrid: { placeholder: 'Filter...', value: column.DataGridFilter, onChange: (v: string) => { column.DataGridFilter = v; }, onSend: undefined as ((v: string) => void) | undefined },
      WebView: { placeholder: 'Assist...', value: column.ChatInput, onChange: (v: string) => { column.ChatInput = v; }, onSend: handleSendChat },
      TextEditor: { placeholder: 'Highlight...', value: column.HighlighterKeyword, onChange: (v: string) => { column.HighlighterKeyword = v; }, onSend: undefined as ((v: string) => void) | undefined },
    }[panel.type];

    elements.push(
      <div
        key={panel.type}
        className={`panel-container ${panel.className}`}
        style={{ height: panel.height }}
        onMouseDown={() => handlePanelFocus(panel.type)}
      >
        <div className={`panel-titlebar ${isFocused ? 'panel-titlebar-focused' : ''}`}>
          <div className="panel-title-row">{titleNode}</div>
          <div className="panel-toolbar">
            {panel.type === 'TextEditor' ? (
              <>
                <KeywordTagInput
                  value={toolbarProps.value}
                  onChange={toolbarProps.onChange}
                  onFocusPanel={() => handleToolFocus(panel.type)}
                />
                <div className="hl-target-toggles">
                  {HL_TARGET_DEFS.map(({ key, label, title }) => (
                    <button
                      key={key}
                      className={`hl-target-btn ${hlTargets[key] ? 'hl-target-btn-on' : ''}`}
                      title={title}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => column.toggleHighlightTarget(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : panel.type === 'WebView' ? (
              <>
                <CommandInput
                  className="panel-toolbar-input"
                  placeholder={toolbarProps.placeholder}
                  value={toolbarProps.value}
                  onChange={(v) => toolbarProps.onChange(v)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleToolFocus(panel.type);
                  }}
                  onSend={toolbarProps.onSend}
                />
                {column.ChatMode && (
                  <>
                    <button
                      className="panel-toolbar-btn panel-toolbar-btn-cs"
                      title="チャットをクリア"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => column.clearChatMessages()}
                    >C</button>
                    <button
                      className="panel-toolbar-btn panel-toolbar-btn-cs"
                      title="チャットを保存 (chat)"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={handleSaveChatToKnowledge}
                    >S</button>
                  </>
                )}
              </>
            ) : (
              <HistoryInput
                className="panel-toolbar-input"
                placeholder={toolbarProps.placeholder}
                value={toolbarProps.value}
                onChange={(v) => toolbarProps.onChange(v)}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleToolFocus(panel.type);
                }}
                historyKey={`thinktank-history-${panel.type.toLowerCase()}`}
                onSend={toolbarProps.onSend}
              />
            )}
            {panel.type === 'DataGrid' && (
              <button
                className="panel-toolbar-btn panel-toolbar-btn-check"
                title="表示アイテムを全チェック/全解除"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={handleToggleAllDisplayedCheck}
              >
                <span className="check-btn-icon">☑</span>
                {column.CheckedCount > 0 && (
                  <span className="check-btn-count">{column.CheckedCount}</span>
                )}
              </button>
            )}
            {panel.type === 'TextEditor' && column.EditorSelection && (
              <button
                className="panel-toolbar-btn panel-toolbar-btn-chat"
                title="Chat with selected text"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={handleStartChat}
              >
                <span className="chat-btn-icon">💬</span>
                <span className="chat-btn-count">{column.EditorSelection.split('\n').length}</span>
              </button>
            )}
          </div>
        </div>
        <div className="panel-content">
          {panel.type === 'DataGrid' && (
            <DataGridPanel
              column={column}
              width={width}
              height={Math.max(0, panel.height - TITLEBAR_TOTAL)}
            />
          )}
          {panel.type === 'TextEditor' && (
            <TextEditorPanel
              column={column}
              width={width - 2}
              height={Math.max(0, panel.height - TITLEBAR_TOTAL - 2)}
            />
          )}
          {panel.type === 'WebView' && (
            <WebViewPanel
              column={column}
              width={width - 2}
              height={Math.max(0, panel.height - TITLEBAR_TOTAL - 2)}
              onChatSend={handleChatSend}
            />
          )}
        </div>
      </div>
    );
  });

  return (
    <div
      className="column-view"
      style={{ width, height, flexShrink: 0 }}
      data-column-index={column.Index}
    >
      {elements}
    </div>
  );
}
