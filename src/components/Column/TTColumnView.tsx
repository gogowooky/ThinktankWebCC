import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TTColumn } from '../../views/TTColumn';
import { TTApplication } from '../../views/TTApplication';
import { Splitter } from '../Layout/Splitter';
import { DataGridPanel } from '../DataGrid/DataGridPanel';
import { TextEditorPanel } from '../TextEditor/TextEditorPanel';
import { WebViewPanel } from '../WebView/WebViewPanel';
import { KEYWORD_COLORS } from '../../utils/editorHighlight';
import { highlightTextSpans } from '../../utils/highlightSpans';
import { toFullUrl, buildChatUrl } from '../../utils/webviewUrl';
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
  className, placeholder, value, onChange, onMouseDown, historyKey, onSend, disabled
}: {
  className: string; placeholder: string; value: string;
  onChange: (v: string) => void; onMouseDown: (e: React.MouseEvent) => void;
  historyKey: string; onSend?: (value: string) => void; disabled?: boolean;
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
        disabled={disabled}
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

/** タイトルバー（タイトル行 + ツールバー + border）の概算高さ */
const TITLEBAR_TOTAL = 40;

const PANEL_TITLES: Record<PanelType, string> = {
  DataGrid: 'DataGrid',
  WebView: 'WebView',
  TextEditor: 'TextEditor',
};

export function TTColumnView({ column, width, height }: TTColumnViewProps) {
  const [ratios, setRatios] = useState<[number, number, number]>(
    () => [...column.VerticalRatios] as [number, number, number]
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
  }, [column, height]);

  const handlePanelFocus = useCallback((panel: PanelType) => {
    const app = TTApplication.Instance;
    app.ActiveColumnIndex = column.Index;
    column.FocusedPanel = panel;
  }, [column]);

  /** チェック済みアイテム＋TextEditor選択テキストでチャット開始 */
  const handleStartChat = useCallback(async () => {
    const context = column.buildChatContext();
    // セッションIDを生成
    const d = new Date();
    const sessionId = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0');

    // コンテキストをIndexedDBの一時レコードに保存
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('thinktank', 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      await new Promise<void>((resolve, reject) => {
        const req = store.put({
          file_id: `_chat_context_${sessionId}`,
          title: 'Chat Context',
          file_type: 'context',
          category: '_system',
          content: JSON.stringify(context),
          metadata: null,
          size_bytes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      db.close();
    } catch (e) {
      console.error('Failed to save chat context:', e);
    }

    // WebViewにチャットURLをセット
    column.WebViewUrl = buildChatUrl(sessionId);
  }, [column]);

  /** ChatバーからのEnter送信 → SSEストリーミング */
  const handleSendChat = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    // 送信前に履歴スナップショット取得
    const history = column.ChatMessages.map(m => ({ role: m.role, content: m.content }));

    column.addChatMessage({ role: 'user', content: trimmed });
    column.addChatMessage({ role: 'assistant', content: '', isStreaming: true });

    try {
      const res = await fetch(`/api/chat/${column.ChatSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
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
          {column.WebViewUrl.trim() && (
            <button
              className="panel-title-open-btn"
              title="Open in new window"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                window.open(toFullUrl(column.WebViewUrl), '_blank');
              }}
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
      DataGrid: { placeholder: 'Filter...', value: column.DataGridFilter, onChange: (v: string) => { column.DataGridFilter = v; }, onSend: undefined as ((v: string) => void) | undefined, disabled: false },
      WebView: { placeholder: 'Assistant...', value: column.ChatInput, onChange: (v: string) => { column.ChatInput = v; }, onSend: handleSendChat, disabled: false },
      TextEditor: { placeholder: 'Highlight...', value: column.HighlighterKeyword, onChange: (v: string) => { column.HighlighterKeyword = v; }, onSend: undefined as ((v: string) => void) | undefined, disabled: false },
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
                  onFocusPanel={() => handlePanelFocus(panel.type)}
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
            ) : (
              <HistoryInput
                className="panel-toolbar-input"
                placeholder={toolbarProps.placeholder}
                value={toolbarProps.value}
                onChange={(v) => toolbarProps.onChange(v)}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handlePanelFocus(panel.type);
                }}
                historyKey={`thinktank-history-${panel.type.toLowerCase()}`}
                onSend={toolbarProps.onSend}
                disabled={toolbarProps.disabled}
              />
            )}
            {panel.type === 'DataGrid' && (() => {
              const displayItems = column.GetDisplayItems();
              const displayIds = displayItems.map(i => i.ID);
              const allChecked = displayIds.length > 0 && displayIds.every(id => column.CheckedItemIDs.has(id));
              
              return (
                <button
                  className={`panel-toolbar-btn panel-toolbar-btn-chat`}
                  title={allChecked ? "Uncheck all displayed items" : "Check all displayed items"}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    column.setAllChecked(displayIds, !allChecked);
                  }}
                >
                  <span className="chat-btn-icon">☑</span>
                  <span className="chat-btn-count">{column.CheckedCount}</span>
                </button>
              );
            })()}
            {panel.type === 'TextEditor' && column.EditorSelection && (
              <button
                className="panel-toolbar-btn panel-toolbar-btn-chat"
                title="Assistant with selected text"
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
