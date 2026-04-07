import { useEffect, useState, useCallback, useRef } from 'react';
import { TTColumn } from '../../views/TTColumn';
import { TTApplication } from '../../views/TTApplication';
import { Splitter } from '../Layout/Splitter';
import { DataGridPanel } from '../DataGrid/DataGridPanel';
import { TextEditorPanel } from '../TextEditor/TextEditorPanel';
import { WebViewPanel } from '../WebView/WebViewPanel';
import { KEYWORD_COLORS } from '../../utils/editorHighlight';
import { toFullUrl, buildChatUrl } from '../../utils/webviewUrl';
import type { PanelType } from '../../types';
import './TTColumnView.css';

/** カンマ区切りキーワードをチップ形式でTextBox内に表示するコンポーネント */
function KeywordTagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value.split(',');
  // 最後の要素が「入力中」、それ以前が確定済みチップ
  const chips = parts.slice(0, -1);
  const current = parts[parts.length - 1];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCurrent = e.target.value;
    onChange(chips.length > 0 ? chips.join(',') + ',' + newCurrent : newCurrent);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && current === '' && chips.length > 0) {
      // 最後のチップを削除して入力に戻す
      const last = chips[chips.length - 1];
      const remaining = chips.slice(0, -1);
      onChange(remaining.length > 0 ? remaining.join(',') + ',' + last : last);
      e.preventDefault();
    }
  };

  return (
    <div
      className="panel-toolbar-input panel-toolbar-tag-input"
      onClick={(e) => {
        const input = (e.currentTarget as HTMLElement).querySelector('input');
        input?.focus();
      }}
    >
      {chips.map((chip, gi) => {
        const trimmed = chip.trim();
        if (!trimmed) return null;
        const color = KEYWORD_COLORS[gi % KEYWORD_COLORS.length];
        return (
          <span key={gi} className="keyword-chip" style={{ backgroundColor: color }}>
            {trimmed}
          </span>
        );
      })}
      <input
        type="text"
        className="keyword-chip-input"
        placeholder={chips.length === 0 ? 'Highlight...' : ''}
        value={current}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

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
    const title = `${isFocused ? '● ' : ''}${PANEL_TITLES[panel.type]}${itemInfo}`;

    const toolbarProps = {
      DataGrid: { placeholder: 'Filter...', value: column.DataGridFilter, onChange: (v: string) => { column.DataGridFilter = v; } },
      WebView: { placeholder: 'Address...', value: column.WebViewUrl, onChange: (v: string) => { column.WebViewUrl = v; } },
      TextEditor: { placeholder: 'Highlight...', value: column.HighlighterKeyword, onChange: (v: string) => { column.HighlighterKeyword = v; } },
    }[panel.type];

    elements.push(
      <div
        key={panel.type}
        className={`panel-container ${panel.className}`}
        style={{ height: panel.height }}
        onMouseDown={() => handlePanelFocus(panel.type)}
      >
        <div className={`panel-titlebar ${isFocused ? 'panel-titlebar-focused' : ''}`}>
          <div className="panel-title-row">{title}</div>
          <div className="panel-toolbar">
            {panel.type === 'TextEditor' ? (
              <KeywordTagInput
                value={toolbarProps.value}
                onChange={toolbarProps.onChange}
              />
            ) : (
              <input
                className="panel-toolbar-input"
                type="text"
                placeholder={toolbarProps.placeholder}
                value={toolbarProps.value}
                onChange={(e) => toolbarProps.onChange(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            )}
            {panel.type === 'DataGrid' && column.CheckedCount > 0 && (
              <button
                className="panel-toolbar-btn panel-toolbar-btn-chat"
                title={`Chat with ${column.CheckedCount} selected items`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={handleStartChat}
              >
                <span className="chat-btn-icon">💬</span>
                <span className="chat-btn-count">{column.CheckedCount}</span>
              </button>
            )}
            {panel.type === 'WebView' && column.WebViewUrl.trim() && (
              <button
                className="panel-toolbar-btn"
                title="Open in new window"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  window.open(toFullUrl(column.WebViewUrl), '_blank');
                }}
              >
                &#x2197;
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
