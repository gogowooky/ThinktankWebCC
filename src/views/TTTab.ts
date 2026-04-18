/**
 * TTTab.ts
 * メインパネルの1タブを表すビューモデル。
 *
 * Phase 4: 基本フィールドと表示タイトル
 * Phase 7 以降: TextEditorView / MarkdownView 等のコンテンツビューと接続
 */

import { TTObject } from '../models/TTObject';
import type { ViewType } from '../types';

export class TTTab extends TTObject {
  /** ビュー種別（Phase 5 以降でコンポーネントの切替に使用）*/
  public ViewType: ViewType = 'texteditor';

  /**
   * 表示対象リソース ID（TTDataItem.ID）。
   * 空文字の場合は「新規タブ」（空エディタ）。
   */
  public ResourceID: string = '';

  /**
   * コンテンツのオンデマンドロード中フラグ。
   * IsMetaOnly=true のアイテムを開いた直後に true になる。
   * LoadContent() 完了後に false に戻す。
   */
  public IsLoading: boolean = false;

  /**
   * 未保存変更フラグ。
   * TextEditor でテキストを編集すると true になる。
   * 保存完了後に false に戻す。
   */
  public IsDirty: boolean = false;

  public override get ClassName(): string {
    return 'TTTab';
  }

  constructor(resourceId: string = '', viewType: ViewType = 'texteditor') {
    super();
    // タブ ID はランダム文字列（同一アイテムを複数タブで開く場合に備える）
    this.ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.ResourceID = resourceId;
    this.ViewType = viewType;
    this.Name = '新規タブ';
  }

  /** タブバーに表示するラベル（IsDirty=true のとき先頭に ● を付ける）*/
  public get DisplayTitle(): string {
    return this.IsDirty ? `● ${this.Name}` : this.Name;
  }
}
