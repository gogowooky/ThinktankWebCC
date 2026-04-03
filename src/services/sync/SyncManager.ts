/**
 * SyncManager.ts
 * リアルタイム同期制御
 *
 * WebSocket経由で他のクライアントからのcontent-updateを受信し、
 * ローカルのTTDataItemに反映する。
 * また、ローカル変更をWebSocketでブロードキャストする。
 */

import { webSocketService, type WSMessage } from './WebSocketService';
import { storageManager } from '../storage/StorageManager';
import type { FileRecord } from '../storage/IStorageService';

/** 同期対象のコレクションを管理するコールバック */
type ItemResolver = (fileId: string) => {
  applyRemoteUpdate?: (content: string) => void;
} | null;

export class SyncManager {
  private itemResolver: ItemResolver | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * 同期を開始
   * @param resolver file_idからアイテムを解決するコールバック
   */
  start(resolver: ItemResolver): void {
    this.itemResolver = resolver;

    // WebSocket接続
    webSocketService.connect();

    // リモート更新の受信ハンドラ
    this.unsubscribe = webSocketService.onMessage((message: WSMessage) => {
      if (message.type === 'content-update') {
        this.handleRemoteUpdate(message.file_id, message.content, message.updated_at);
      }
    });

    console.log('[SyncManager] Started');
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    webSocketService.disconnect();
    this.itemResolver = null;
    console.log('[SyncManager] Stopped');
  }

  /**
   * ローカル変更を送信（エディタからの呼び出し用）
   */
  broadcastChange(fileId: string, content: string): void {
    webSocketService.sendContentUpdate(fileId, content);
  }

  /**
   * ローカル変更をストレージに保存 + ブロードキャスト
   */
  async saveAndBroadcast(record: FileRecord): Promise<void> {
    await storageManager.saveFile(record);
    if (record.content !== null) {
      this.broadcastChange(record.file_id, record.content);
    }
  }

  /**
   * リモート更新の受信処理
   */
  private async handleRemoteUpdate(fileId: string, content: string, updatedAt: string): Promise<void> {
    // IndexedDBを更新
    const existing = await storageManager.getFile(fileId);
    if (existing) {
      existing.content = content;
      existing.updated_at = updatedAt;
      await storageManager.saveFile(existing);
    }

    // メモリ上のアイテムを更新
    if (this.itemResolver) {
      const item = this.itemResolver(fileId);
      if (item?.applyRemoteUpdate) {
        item.applyRemoteUpdate(content);
        console.log(`[SyncManager] Applied remote update for ${fileId}`);
      }
    }
  }
}

export const syncManager = new SyncManager();
