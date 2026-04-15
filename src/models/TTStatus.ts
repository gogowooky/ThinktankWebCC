import { TTCollection } from './TTCollection';
import { TTObject } from './TTObject';
import { TTState } from './TTState';
import type { StateConfig } from '../types';

/** ColumnIndex用ワイルドカード展開定数（1ベース） */
const COLUMN_INDICES = [1, 2, 3] as const;

/**
 * TTStatus - UI状態管理コレクション
 *
 * TTStateアイテムを保持し、RegisterState/SetValue/GetValue で
 * アプリケーション全体のUI状態を管理する。
 */
export class TTStatus extends TTCollection {

  public override get ClassName(): string {
    return 'TTStatus';
  }

  constructor() {
    super();
    this.Description = 'Status';
    this.ItemSaveProperties = 'ID,Name,Value,UpdateDate';
    this.ListPropertiesMin = 'ID,Value';
    this.ListProperties = 'ID,Value';
    this.ColumnMapping = 'ID:ステータスID,Name:簡易説明,Value:設定値';
    this.ColumnMaxWidth = 'ID:25,Name:40,Value:20';
  }

  /**
   * 状態を登録する
   * [Columns]ワイルドカードで列0/1/2に展開可能
   */
  public RegisterState(id: string, description: string, config: string | StateConfig): void {
    try {
      // [Columns] ワイルドカード展開
      if (id.includes('[Columns]')) {
        COLUMN_INDICES.forEach(idx => {
          const _id = id.replace('[Columns]', String(idx));
          const _desc = description.replace('[Columns]', String(idx));
          this.RegisterState(_id, _desc, config);
        });
        return;
      }

      const state = new TTState(id, description, config);
      this.AddItem(state);
    } catch (e) {
      console.error(`TTStatus: RegisterState error ${id}`, e);
    }
  }

  /** 値を取得 */
  public GetValue(id: string): string {
    const item = this.GetItem(id);
    if (item instanceof TTState) {
      return item.Value;
    }
    return '';
  }

  /** 値を設定（変更があれば通知） */
  public SetValue(id: string, value: string): void {
    try {
      const item = this.GetItem(id);
      if (item instanceof TTState) {
        if (item.Value !== value) {
          item.Value = value;
          item.NotifyUpdated();
          this.NotifyUpdated();
        }
      } else {
        console.warn(`TTStatus: SetValue - item not found: ${id}`);
      }
    } catch (e) {
      console.error(`TTStatus: SetValue error id:${id} value:${value}`, e);
    }
  }

  /** 値をビューに適用 */
  public ApplyValue(id: string, value: string): void {
    try {
      const item = this.GetItem(id);
      if (item instanceof TTState) {
        item.Apply(value);
      }
    } catch (e) {
      console.error(`TTStatus: ApplyValue error id:${id}`, e);
    }
  }

  /** ロード後に全状態をビューに適用 */
  public override async LoadCache(): Promise<void> {
    await super.LoadCache();
    for (const item of this.GetItems()) {
      if (item instanceof TTState) {
        item.Apply(item.Value);
      }
    }
  }

  protected override CreateChildInstance(): TTObject {
    return new TTState();
  }
}
