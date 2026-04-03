/**
 * WebSocketService.ts
 * WebSocket接続管理（自動再接続付き）
 *
 * サーバの /ws エンドポイントに接続し、content-update メッセージを送受信する。
 * 接続断時は指数バックオフで自動再接続（最大30秒間隔）。
 */

export interface ContentUpdateMessage {
  type: 'content-update';
  file_id: string;
  content: string;
  updated_at: string;
  sender_id: string;
}

export type WSMessage = ContentUpdateMessage;
export type MessageHandler = (message: WSMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private _connected = false;

  /** このクライアントの一意ID（自分自身の送信を無視する用） */
  readonly clientId: string;

  get isConnected(): boolean {
    return this._connected;
  }

  constructor() {
    this.clientId = crypto.randomUUID();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${location.host}/ws`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this._connected = true;
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          // 自分が送ったメッセージは無視
          if ('sender_id' in message && message.sender_id === this.clientId) return;
          this.handlers.forEach(handler => handler(message));
        } catch (e) {
          console.error('[WebSocket] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this._connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this._connected = false;
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // 再接続を防止
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  send(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** content-update を送信 */
  sendContentUpdate(fileId: string, content: string): void {
    this.send({
      type: 'content-update',
      file_id: fileId,
      content,
      updated_at: new Date().toISOString(),
      sender_id: this.clientId,
    });
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    this.reconnectAttempts++;

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const webSocketService = new WebSocketService();
