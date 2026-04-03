import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { TTColumn } from '../../views/TTColumn';
import { markdownToHtml } from '../../utils/markdownToHtml';
import './WebView.css';

/**
 * WebViewPanel - WebView表示パネル
 *
 * column.WebViewUrlに応じて表示を切り替え:
 * - 空文字: 選択中アイテムのMarkdownプレビュー
 * - http(s)://: iframe表示
 * - 将来: search:, chat:, related: 等のプロトコル対応
 */

interface WebViewPanelProps {
  column: TTColumn;
  width: number;
  height: number;
}

export function WebViewPanel({ column, width, height }: WebViewPanelProps) {
  const [tick, setTick] = useState(0);
  const rerender = useCallback(() => setTick(t => t + 1), []);
  const markdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const colKey = `WebViewPanel-col-${column.Index}`;
    column.AddOnUpdate(colKey, rerender);

    const collection = column.GetCurrentCollection();
    const collKey = `WebViewPanel-coll-${column.Index}`;
    collection?.AddOnUpdate(collKey, rerender);

    return () => {
      column.RemoveOnUpdate(colKey);
      collection?.RemoveOnUpdate(collKey);
    };
  }, [column, column.DataGridResource, rerender]);

  // Markdownプレビュー内のリンククリックでパネル間連携
  useEffect(() => {
    const container = markdownRef.current;
    if (!container) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      e.preventDefault();
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('http://') || href.startsWith('https://')) {
        // 外部URL → WebView Addressに設定してiframe表示
        column.WebViewUrl = href;
      } else if (href.startsWith('filter:')) {
        // filter:キーワード → DataGridフィルタを設定
        column.DataGridFilter = decodeURIComponent(href.slice(7));
      } else if (href.startsWith('item:')) {
        // item:ID → TextEditorで該当アイテムを開く
        column.EditorResource = decodeURIComponent(href.slice(5));
      }
    };
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [column]);

  const url = column.WebViewUrl.trim();

  // Markdownプレビュー: URLが空のとき、選択中アイテムのContentを表示
  // tickでObserver通知（Content変更含む）に反応して再計算
  const markdownHtml = useMemo(() => {
    void tick;
    if (url !== '') return '';
    const itemId = column.EditorResource;
    if (!itemId) return '';
    const collection = column.GetCurrentCollection();
    if (!collection) return '';
    const item = collection.GetDataItem(itemId);
    if (!item) return '';
    return markdownToHtml(item.Content);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, column, column.EditorResource, tick]);

  if (height <= 0 || width <= 0) return null;

  // URL入力あり → iframe
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return (
      <div className="webview-panel" style={{ width, height }}>
        <iframe
          className="webview-iframe"
          src={url}
          title="WebView"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    );
  }

  // Markdownプレビュー
  if (markdownHtml) {
    return (
      <div className="webview-panel" style={{ width, height }}>
        <div
          ref={markdownRef}
          className="webview-markdown"
          dangerouslySetInnerHTML={{ __html: markdownHtml }}
        />
      </div>
    );
  }

  // 空状態
  return (
    <div className="webview-panel" style={{ width, height }}>
      <div className="webview-empty">No content</div>
    </div>
  );
}
