import { useEffect, useState, useCallback, useRef, KeyboardEvent, useReducer } from 'react';
import { Splitter } from '../Layout/Splitter';
import { TTColumn } from '../../views/TTColumn';
import { TTApplication } from '../../views/TTApplication';
import { TTModels } from '../../models/TTModels';
import { TTDataCollection } from '../../models/TTDataCollection';
import { isExternalUrl, buildMarkdownUrl, parseViewUrl } from '../../utils/webviewUrl';
import { applyIframeHighlight } from '../../utils/highlightSpans';
import { markdownToHtml } from '../../utils/markdownToHtml';
import type { ChatMessage } from '../../types';
import './WebView.css';

/**
 * WebViewPanel - URL駆動のWebView表示パネル
 *
 * column.WebViewUrl に基づいて表示を切り替え:
 * - /view/markdown?id={id} : クライアントサイドでMarkdown→HTML変換してインライン表示
 * - http(s)://...          : 外部サイト iframe表示
 * - 空文字                 : CLIチャット表示
 */

interface WebViewPanelProps {
  column: TTColumn;
  width: number;
  height: number;
  onChatSend?: (text: string) => Promise<void>;
}

/** クライアントサイド Markdown HTML レンダリング */
function MarkdownView({ column, id }: { column: TTColumn; id: string }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setHtml(''); setLoading(false); return; }
    const item = column.GetCurrentCollection()?.GetDataItem(id);
    if (!item) { setHtml('<p style="color:#ff6b6b">Item not found: ' + id + '</p>'); setLoading(false); return; }

    if (item.IsLoaded) {
      setHtml(markdownToHtml(item.Content));
      setLoading(false);
    } else {
      setLoading(true);
      item.LoadContent().then(() => {
        setHtml(markdownToHtml(item.Content));
        setLoading(false);
      }).catch(() => {
        setHtml('<p style="color:#ff6b6b">Failed to load content</p>');
        setLoading(false);
      });
    }
  }, [column, id]);

  if (loading) {
    return <div className="webview-markdown" style={{ color: '#666' }}>Loading...</div>;
  }

  return (
    <div
      className="webview-markdown"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const CHAT_INPUT_MAX = 400;

/** CLIスタイルチャット表示（＋チャットモード時のスプリッター可変入力エリア） */
function ChatCliView({
  messages,
  chatMode,
  onSend,
}: {
  messages: ChatMessage[];
  chatMode: boolean;
  onSend?: (text: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  // 入力エリアの高さ。デフォルト 0 = 閉じた状態
  const [inputHeight, setInputHeight] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  // useReducer で強制再レンダリング（Splitter の getBoundingClientRect 更新用）
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  // messages 追加時に最下部へスクロール
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant' });
  });

  // chatMode が false になったとき入力エリアを閉じる
  useEffect(() => {
    if (!chatMode) setInputHeight(0);
  }, [chatMode]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !onSend) return;
    onSend(text);
    setInput('');
  }, [input, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSplitterResize = useCallback((delta: number) => {
    setInputHeight(h => Math.max(0, Math.min(CHAT_INPUT_MAX, h - delta)));
    forceUpdate();
  }, []);

  return (
    <div className="chat-cli">
      <div className="chat-cli-messages">
        {messages.length === 0 && (
          <div className="chat-cli-empty">Chat...</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-cli-message chat-cli-${msg.role}${msg.isStreaming ? ' chat-cli-streaming' : ''}`}>
            {msg.role === 'user'
              ? <><span className="chat-cli-prompt">&gt; </span>{msg.content}</>
              : <div
                  className="chat-cli-md"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content || '') }}
                />
            }
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {chatMode && (
        <>
          {/* スプリッター: 常時表示。上へドラッグで入力エリアを展開 */}
          <Splitter direction="vertical" onResize={handleSplitterResize} />
          {/* 入力エリア: 高さ 0 のときは非表示 */}
          {inputHeight > 0 && (
            <div className="chat-cli-input-area" style={{ height: inputHeight }}>
              <textarea
                className="chat-cli-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter で送信 / Shift+Enter で改行"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function WebViewPanel({ column, width, height, onChatSend }: WebViewPanelProps) {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick(t => t + 1), []);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const colKey = `WebViewPanel-col-${column.Index}`;
    column.AddOnUpdate(colKey, rerender);
    return () => column.RemoveOnUpdate(colKey);
  }, [column, rerender]);

  // キーワード/対象設定変更時にiframeハイライトを再適用（column.AddOnUpdateパターン）
  useEffect(() => {
    const key = `WebViewPanel-hl-${column.Index}`;
    const applyHighlight = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        if (!doc || !doc.body) return;
        if (column.HighlightTargets.webView && column.HighlighterKeyword) {
          applyIframeHighlight(doc, column.HighlighterKeyword);
        } else {
          applyIframeHighlight(doc, '');
        }
      } catch {
        // cross-origin - ignore
      }
    };
    column.AddOnUpdate(key, applyHighlight);
    return () => column.RemoveOnUpdate(key);
  }, [column]);

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

  // iframe内リンククリックでパネル間連携 + ロード時ハイライト適用
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc || !doc.body) return;

        // iframe内クリックでパネルフォーカスを設定（同一オリジン）
        doc.addEventListener('pointerdown', () => {
          TTApplication.Instance.ActiveColumnIndex = column.Index;
          column.FocusedPanel = 'WebView';
        });

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

        // ロード完了時にハイライトを適用
        if (column.HighlightTargets.webView && column.HighlighterKeyword) {
          applyIframeHighlight(doc, column.HighlighterKeyword);
        }
      } catch {
        // cross-origin iframe - can't access contentDocument
      }
    };

    iframe.addEventListener('load', handleLoad);

    // effect 実行時点で既にロード済みの場合は即時実行（load イベントが先行した場合の対策）
    try {
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete' && iframe.contentDocument.body) {
        handleLoad();
      }
    } catch {
      // cross-origin - ignore
    }

    return () => iframe.removeEventListener('load', handleLoad);
  }, [column]);

  // iframeへのフォーカス移動を検知してパネルフォーカス状態を更新する
  useEffect(() => {
    const handleWindowBlur = () => {
      // blurイベント発生直後は activeElement が更新されていない場合があるため遅延評価
      setTimeout(() => {
        if (document.activeElement === iframeRef.current) {
          TTApplication.Instance.ActiveColumnIndex = column.Index;
          column.FocusedPanel = 'WebView';
        }
      }, 0);
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [column]);

  const url = column.WebViewUrl.trim();

  if (height <= 0 || width <= 0) return null;

  // /view/markdown → クライアントサイドで直接レンダリング（BigQuery不要）
  if (url.startsWith('/view/markdown')) {
    const route = parseViewUrl(url);
    const id = route?.params.id ?? '';
    return (
      <div className="webview-panel" style={{ width, height }}>
        <MarkdownView column={column} id={id} />
      </div>
    );
  }

  // 外部URL → iframe表示
  if (url && isExternalUrl(url)) {
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

  // デフォルト: CLIチャット表示
  return (
    <div className="webview-panel" style={{ width, height }}>
      <ChatCliView
        messages={column.ChatMessages}
        chatMode={column.ChatMode}
        onSend={onChatSend}
      />
    </div>
  );
}
