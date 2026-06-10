// 個別データアイテム（仕様書03 §1.4）

import { TTObject } from './TTObject';
import type { ContentType, ThinkMeta } from '../types';
import { extractTitle } from '../utils/thinkFormat';

const normalizeNewlines = (s: string) => s.replace(/\r\n/g, '\n');

export class TTThink extends TTObject {
  ContentType: ContentType = 'memo';
  Keywords = '';
  RelatedIds = '';
  CreatedAt = '';
  IsDeleted = false;
  SizeBytes = 0;
  /** 本文がストレージからロード済みか（メタのみの状態と区別） */
  ContentLoaded = false;

  private _content = '';
  private _savedContent = '';

  get Content(): string {
    return this._content;
  }

  set Content(value: string) {
    this._content = value;
    this.Name = extractTitle(value);
  }

  get IsDirty(): boolean {
    return normalizeNewlines(this._content) !== normalizeNewlines(this._savedContent);
  }

  /** 保存完了後に呼び、dirty状態を解除する */
  MarkSaved(): void {
    this._savedContent = this._content;
    this.NotifyUpdated(false);
  }

  /** ストレージからロードした本文をセットする（dirtyにしない） */
  SetLoadedContent(content: string): void {
    this._content = content;
    this._savedContent = content;
    this.Name = extractTitle(content);
    this.ContentLoaded = true;
  }

  ApplyMeta(meta: ThinkMeta): void {
    this.ID = meta.id;
    this.ContentType = (meta.contentType as ContentType) || 'memo';
    this.Name = meta.title;
    this.Keywords = meta.keywords;
    this.RelatedIds = meta.relatedIds;
    this.SizeBytes = meta.sizeBytes;
    this.IsDeleted = meta.isDeleted;
    this.CreatedAt = meta.createdAt;
    this.UpdateDate = meta.updatedAt;
  }
}
