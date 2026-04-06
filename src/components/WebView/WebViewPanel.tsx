import { useEffect, useState, useCallback, useRef } from 'react';
import { TTColumn } from '../../views/TTColumn';
import { TTModels } from '../../models/TTModels';
import { TTDataCollection } from '../../models/TTDataCollection';
import { isExternalUrl, buildMarkdownUrl } from '../../utils/webviewUrl';
import './WebView.css';

/**
 * WebViewPanel - URL駆動のWebView表示パネル
 *
 * column.WebViewUrl (= address bar) に基づいてiframe表示:
 * - /view/markdown?category=Memos&id={id} : サーバーがHTML返却 → iframe表示
 * - http(s)://...  : 外部サイト iframe表示
 * - 空文字         : 空状態
 * - 将来: /view/chat, /view/search, /view/related 等
 *
 * サーバー側ルート(/view/*)がHTMLを返すため、
 * クライアント側でのmarkdown→HTML変換は不要。
 */

interface WebViewPanelProps {
  column: TTColumn;
  width: number;
  height: number;
}

export function WebViewPanel({ column, width, height }: WebViewPanelProps) {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick(t => t + 1), []);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const colKey = `WebViewPanel-col-${column.Index}`;
    column.AddOnUpdate(colKey, rerender);
    return () => column.RemoveOnUpdate(colKey);
  }, [column, rerender]);

  // iframe postMessage受信 → コレクションにアイテム追加
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'thinktank-item-saved') return;
      const record = e.data.record;
      if (!record || !record.file_id || !record.category) return;

      // カテゴリに対応するコレクションを取得して追加
      // 1. ID一致 → 2. DatabaseID一致 → 3. HandledCategories含む
      const models = TTModels.Instance;
      const category = record.category;
      let col = models.GetItem(category);
      if (!(col instanceof TTDataCollection)) {
        const allItems = models.GetItems();
        col = allItems.find(item =>
          item instanceof TTDataCollection && (
            (item as TTDataCollection).DatabaseID === category ||
            (item as TTDataCollection).HandledCategories.includes(category)
          )
        ) || undefined;
      }
      if (col instanceof TTDataCollection) {
        col.AddOrUpdateFromRecord(record);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // iframe内リンククリックでパネル間連携
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;

        doc.addEventListener('click', (e: MouseEvent) => {
          const anchor = (e.target as HTMLElement).closest('a');
          if (!anchor) return;
          const href = anchor.getAttribute('href') || '';

          if (href.startsWith('filter:')) {
            e.preventDefault();
            column.DataGridFilter = decodeURIComponent(href.slice(7));
          } else if (href.startsWith('item:')) {
            e.preventDefault();
            const itemId = decodeURIComponent(href.slice(5));
            column.EditorResource = itemId;
            column.WebViewUrl = buildMarkdownUrl(
              column.DataGridResource || 'Memos',
              itemId,
            );
          }
          // http(s):// links: let iframe handle normally
        });
      } catch {
        // cross-origin iframe - can't access contentDocument
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [column]);

  const url = column.WebViewUrl.trim();

  if (height <= 0 || width <= 0) return null;

  // URL入力あり → iframe（外部URL、内部/view/* 両方）
  if (url && (isExternalUrl(url) || url.startsWith('/view/'))) {
    return (
      <div className="webview-panel" style={{ width, height }}>
        <iframe
          ref={iframeRef}
          className="webview-iframe"
          src={url}
          title="WebView"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
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
