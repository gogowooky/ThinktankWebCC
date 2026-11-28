/**
 * TTVault.ts
 * v5 保管庫クラス。TTCollection の派生クラス。
 *
 * データ階層: TTVault > Bundles > Bundle > Think
 *
 * 正本: Firestore users/{uid}/vaults/{vaultId}/thinks/{thinkid}
 * PC版バックアップ: Thinktank/vault_ver2/{thinkid}.md
 *
 * 中身は土台から順に TTVaultStore.ts（一覧の読み込み・取得）→ TTVaultProjects.ts（Project の解決・親の同期）
 * → TTVaultCreation.ts（作成）と継承して分けてある。ここには MCP からの変更の反映と削除を置く。
 */

import { TTThink, type ProjectMembersListener } from './TTThink';
import type { ContentType } from '../types';
import { StorageManager } from '../services/storage/StorageManager';
import { parseProject } from '../utils/thinkFormat';
import { TTVaultCreation } from './TTVaultCreation';

export type { BundleResolutionOptions, VaultLoadError } from './TTVaultStore';

export class TTVault extends TTVaultCreation implements ProjectMembersListener {
  /**
   * AI CLI が MCP サーバー経由で作成・更新したレコードを Firestore 正本およびインメモリ Vault へ同期反映する。
   */
  public async ApplyMcpRecordSync(record: {
    meta: {
      thinkid: string;
      category: string;
      title: string;
      keywords?: string | null;
      relatedIds?: string | null;
      updatedAt?: string;
      metadata?: Record<string, unknown>;
    };
    body: string;
    support?: Record<string, unknown>;
  }): Promise<TTThink> {
    const id = record.meta.thinkid;
    const rawCat = record.meta.category || 'memo';
    const contentType = (rawCat === 'bundle' ? 'project' : rawCat === 'abstract' ? 'memo' : rawCat) as ContentType;
    const fullContent = record.body ? `${record.meta.title}\n${record.body}` : record.meta.title;
    const mergedMetadata = {
      ...(record.meta.metadata ?? {}),
      ...(record.support ?? {}),
    };

    let think = this.GetThink(id);
    const previousMembers = contentType === 'project' && think && !think.IsMetaOnly
      ? parseProject(think.Content).ids : null;
    if (!think) {
      think = new TTThink();
      think.ID = id;
      think.VaultID = this.ID;
      think._parent = this;
      this._children.set(id, think);
      this.Count = this._children.size;
      this.InvalidateItemsCache();
    }

    think.ContentType = contentType;
    think.Keywords = record.meta.keywords ?? '';
    think.RelatedIDs = record.meta.relatedIds ?? '';
    think.IsMetaOnly = false;
    think.setContentSilent(fullContent);
    if (Object.keys(mergedMetadata).length > 0) {
      think.Metadata = mergedMetadata;
      think.markMetadataSaved();
    }
    if (record.meta.updatedAt) {
      think.UpdatedAt = record.meta.updatedAt;
    }
    think.markSaved();

    try {
      const saved = await StorageManager.instance.save({
        thinkid: id,
        category: contentType,
        fullContent,
        keywords: think.Keywords,
        relatedIds: think.RelatedIDs,
        ...(Object.keys(mergedMetadata).length > 0 ? { metadata: mergedMetadata } : {}),
      });
      if (saved?.updatedAt) {
        think.UpdatedAt = saved.updatedAt;
      }
    } catch (err) {
      console.warn(`[TTVault] ApplyMcpRecordSync Firestore sync warning (${id}):`, err);
    }
    // 子の Think を新規作成して Project に載せた直後もここを通る（子は先に同期済み）
    if (contentType === 'project') await this.SyncParentProjectIds(id, previousMembers, parseProject(fullContent).ids);

    this.NotifyUpdated();
    return think;
  }

  /** 指定 ID の Think を 保存先から削除しメモリからも除去する。
   *  一部の削除が失敗した場合でも成功した分はメモリからも除去し（サーバーと状態を
   *  一致させる）、失敗した ID を含むエラーを呼び出し元に通知する。 */
  public async DeleteThinks(ids: string[]): Promise<void> {
    const results = await Promise.allSettled(ids.map(id => StorageManager.instance.delete(id)));
    const failedIds: string[] = [];
    results.forEach((result, i) => {
      const id = ids[i];
      if (result.status === 'fulfilled') {
        this._children.delete(id);
      } else {
        failedIds.push(id);
        console.error(`[TTVault] DeleteThinks failed (${id}):`, result.reason);
      }
    });
    this.Count = this._children.size;
    this.InvalidateItemsCache();
    this.NotifyUpdated();
    // 削除した project を親として記録している Think から、その記録を外す
    const deleted = new Set(ids.filter(id => !failedIds.includes(id)));
    const orphans = [...this._children.values()].filter(t => deleted.has(this._parentProjectIdOf(t.ID) ?? ''));
    await this._settleParentWrites(orphans.map(t => this._writeParentProjectId(t.ID, undefined)));
    if (failedIds.length > 0) {
      throw new Error(`一部のThinkの削除に失敗しました: ${failedIds.join(', ')}`);
    }
  }
}
