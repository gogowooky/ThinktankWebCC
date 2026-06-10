// 保管庫ルート（仕様書03 §1.5）

import { TTCollection } from './TTCollection';
import { TTThink } from './TTThink';
import type { ContentType } from '../types';
import { StorageManager } from '../services/StorageManager';
import { formatIdTimestamp } from '../utils/dateUtils';
import { parseThought } from '../utils/thinkFormat';
import { parseDateRange, inDateRange } from '../utils/dateUtils';

export class TTVault extends TTCollection<TTThink> {
  VaultName = 'vault';
  DataFolder = '';
  IsLoading = false;

  get Thinks(): TTThink[] {
    return this.Children.filter((t) => !t.IsDeleted);
  }

  /** ContentType='thought' のデータ一覧 */
  get Thoughts(): TTThink[] {
    return this.Thinks.filter((t) => t.ContentType === 'thought');
  }

  async LoadAll(): Promise<void> {
    this.IsLoading = true;
    this.NotifyUpdated(false);
    try {
      const metas = await StorageManager.Instance.backend.listMeta();
      this.ClearChildren();
      for (const meta of metas) {
        const think = new TTThink();
        think.ApplyMeta(meta);
        this.AddChild(think);
      }
    } finally {
      this.IsLoading = false;
      this.NotifyUpdated(false);
    }
  }

  /** 本文未ロードのThinkについてストレージから本文を取得する */
  async EnsureContent(id: string): Promise<TTThink | undefined> {
    const think = this.GetChild(id);
    if (!think) return undefined;
    if (!think.ContentLoaded) {
      const content = await StorageManager.Instance.backend.getContent(id);
      if (content !== null) {
        think.SetLoadedContent(content);
        think.NotifyUpdated(false);
      }
    }
    return think;
  }

  async SaveThink(think: TTThink): Promise<void> {
    const meta = await StorageManager.Instance.backend.save({
      id: think.ID,
      contentType: think.ContentType,
      fullContent: think.Content,
      keywords: think.Keywords,
      relatedIds: think.RelatedIds,
    });
    think.UpdateDate = meta.updatedAt;
    think.CreatedAt = meta.createdAt;
    think.SizeBytes = meta.sizeBytes;
    think.MarkSaved();
    this.NotifyUpdated(false);
  }

  async DeleteThink(id: string): Promise<void> {
    await StorageManager.Instance.backend.delete(id);
    const think = this.GetChild(id);
    if (think) {
      think.IsDeleted = true;
      think.NotifyUpdated(false);
    }
    this.NotifyUpdated(false);
  }

  NewThink(contentType: ContentType, content?: string): TTThink {
    const think = new TTThink();
    think.ID = formatIdTimestamp();
    // 同時刻のIDが衝突する場合は連番サフィックスを付与
    let suffix = 0;
    while (this._children.has(suffix === 0 ? think.ID : `${think.ID}-${suffix}`)) suffix++;
    if (suffix > 0) think.ID = `${think.ID}-${suffix}`;
    think.ContentType = contentType;
    think.CreatedAt = new Date().toISOString();
    think.Content = content ?? defaultContentFor(contentType);
    think.ContentLoaded = true;
    this.AddChild(think);
    this.NotifyUpdated(false);
    return think;
  }

  /** システムThink（__tt_ui_state__ 等）をID直指定で取得・なければ作成 */
  async EnsureSystemThink(id: string, contentType: ContentType, defaultContent: string): Promise<TTThink> {
    let think = this.GetChild(id);
    if (!think) {
      think = new TTThink();
      think.ID = id;
      think.ContentType = contentType;
      think.CreatedAt = new Date().toISOString();
      think.Content = defaultContent;
      think.ContentLoaded = true;
      this.AddChild(think);
      await this.SaveThink(think);
    } else {
      await this.EnsureContent(id);
    }
    return think;
  }

  /**
   * Thought の条件（明示ID・メタフィルタ・全文検索フィルタ）に基づいて
   * Think を抽出する（仕様書03 §2.4）
   */
  FilterByThought(thought: TTThink): TTThink[] {
    const parsed = parseThought(thought.Content);
    const result = new Map<string, TTThink>();

    for (const id of parsed.ids) {
      const t = this.GetChild(id);
      if (t && !t.IsDeleted) result.set(id, t);
    }

    const f = parsed.filter;
    if (f.keyword || f.createdRange || f.updatedRange) {
      const kw = f.keyword?.toLowerCase();
      const created = f.createdRange ? parseDateRange(f.createdRange) : null;
      const updated = f.updatedRange ? parseDateRange(f.updatedRange) : null;
      for (const t of this.Thinks) {
        if (t.ID === thought.ID) continue;
        if (kw && !(`${t.Name} ${t.Keywords}`.toLowerCase().includes(kw))) continue;
        if (created && !inDateRange(t.CreatedAt, created)) continue;
        if (updated && !inDateRange(t.UpdateDate, updated)) continue;
        result.set(t.ID, t);
      }
    }

    const sf = parsed.searchFilter;
    if (sf.keyword) {
      const kw = sf.keyword.toLowerCase();
      for (const t of this.Thinks) {
        if (t.ID === thought.ID) continue;
        const text = `${t.Name} ${t.Content}`.toLowerCase();
        if (text.includes(kw)) result.set(t.ID, t);
      }
    }

    return [...result.values()];
  }
}

function defaultContentFor(contentType: ContentType): string {
  switch (contentType) {
    case 'thought':
      return '新しいThought\n> Keyword：\n';
    case 'table':
      return '新しいテーブル\n> key,value\n';
    case 'chat':
      return '新しいチャット\n';
    case 'links':
      return '新しいリンク集\n';
    default:
      return '# 新しいメモ\n';
  }
}
