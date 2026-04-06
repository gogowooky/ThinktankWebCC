/**
 * WebSocketService.ts
 * 複数ブラウザ/タブ間のリアルタイム同期用WebSocketクライアント
 */

// メッセージタイプ定義
export interface ContentUpdateMessage {
    type: 'content-update';
    fileId: string;
    content: string;
    timestamp: number;
}

export type WebSocketMessage = ContentUpdateMessage;

// コールバック型
type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketService {
    private ws: WebSocket | null = null;
    private url: string = '';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectDelay: number = 1000;
    private handlers: Map<string, MessageHandler> = new Map();
    private isConnecting: boolean = false;

    /**
     * WebSocket接続を初期化
     */
    initialize(): void {
        // 開発環境と本番環境で適切なURLを使用
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;

        // 開発時は Vite デベロップメントサーバー経由であることを import.meta.env.DEV で判定し、
        // バックエンドのポート (8080) を直接指定する。
        // 本番時 (ビルド後) は同じホストを使用する。
        if (import.meta.env.DEV) {
            // 開発環境: バックエンドは8080で動作
            this.url = `ws://localhost:8080/ws`;
        } else {
            this.url = `${protocol}//${host}/ws`;
        }

        this.connect();
    }

    private connect(): void {
        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        this.isConnecting = true;
        console.log(`[WebSocketService] Connecting to ${this.url}...`);

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[WebSocketService] Connected');
                this.reconnectAttempts = 0;
                this.isConnecting = false;
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as WebSocketMessage;
                    console.log('[WebSocketService] Received:', message.type);
                    this.notifyHandlers(message);
                } catch (e) {
                    console.error('[WebSocketService] Failed to parse message:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('[WebSocketService] Disconnected');
                this.isConnecting = false;
                this.ws = null;
                this.scheduleReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('[WebSocketService] Error:', error);
                this.isConnecting = false;
            };
        } catch (e) {
            console.error('[WebSocketService] Failed to create WebSocket:', e);
            this.isConnecting = false;
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[WebSocketService] Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        console.log(`[WebSocketService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => this.connect(), delay);
    }

    private notifyHandlers(message: WebSocketMessage): void {
        this.handlers.forEach(handler => {
            try {
                handler(message);
            } catch (e) {
                console.error('[WebSocketService] Handler error:', e);
            }
        });
    }

    /**
     * メッセージハンドラを登録
     */
    addHandler(id: string, handler: MessageHandler): void {
        this.handlers.set(id, handler);
    }

    /**
     * メッセージハンドラを解除
     */
    removeHandler(id: string): void {
        this.handlers.delete(id);
    }

    /**
     * コンテンツ更新メッセージを送信
     */
    sendContentUpdate(fileId: string, content: string): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[WebSocketService] Not connected, skipping send');
            return;
        }

        const message: ContentUpdateMessage = {
            type: 'content-update',
            fileId,
            content,
            timestamp: Date.now()
        };

        this.ws.send(JSON.stringify(message));
        console.log(`[WebSocketService] Sent content-update for ${fileId}`);
    }

    /**
     * 接続状態を取得
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}

// シングルトンインスタンス
export const webSocketService = new WebSocketService();
