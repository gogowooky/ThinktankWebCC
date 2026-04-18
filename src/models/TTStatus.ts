/**
 * TTStatus.ts
 * アプリ全体の状態を集中管理するコレクション。
 * TTState を子アイテムとして保持する。
 *
 * Phase 3: RegisterState / GetValue / SetValue / ApplyValue
 * Phase 30 以降: DefaultStatus（パネル状態・エディタ状態等）の登録
 */

import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';
import { TTState } from './TTState';
import type { TTStateConfig } from '../types';

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
  }

  // ── 状態の登録 ─────────────────────────────────────────────────────

  /**
   * 状態を登録する。
   * @param id         状態ID（例: 'LeftPanel.IsOpen'）
   * @param description 人間向け説明
   * @param config     デフォルト値（文字列）または TTStateConfig
   */
  public RegisterState(
    id: string,
    description: string,
    config: string | TTStateConfig = ''
  ): void {
    try {
      if (this.GetItem(id)) return; // 重複登録はスキップ
      const state = new TTState(id, description, config);
      this.AddItem(state);
    } catch (e) {
      console.error(`[TTStatus] RegisterState error: ${id}`, e);
    }
  }

  // ── 値の読み書き ───────────────────────────────────────────────────

  /** 状態値を取得する（存在しない場合は空文字） */
  public GetValue(id: string): string {
    const item = this.GetItem(id);
    return item instanceof TTState ? item.Value : '';
  }

  /**
   * 状態値を設定し、変更があれば Observer に通知する。
   * Apply は呼ばない（UI 反映は ApplyValue で明示的に行う）。
   */
  public SetValue(id: string, value: string): void {
    try {
      const item = this.GetItem(id);
      if (!(item instanceof TTState)) {
        console.warn(`[TTStatus] SetValue: 未登録の状態 ${id}`);
        return;
      }
      if (item.Value === value) return; // 変化なしはスキップ
      item.Value = value;
      item.NotifyUpdated();
    } catch (e) {
      console.error(`[TTStatus] SetValue error: ${id}=${value}`, e);
    }
  }

  /**
   * Apply 関数を実行して UI に反映する。
   * Phase 30 以降: DefaultStatus の Apply がコンポーネント状態を更新する。
   */
  public ApplyValue(id: string, value: string): void {
    try {
      const item = this.GetItem(id);
      if (item instanceof TTState) {
        item.Apply(value);
      } else {
        console.warn(`[TTStatus] ApplyValue: 未登録の状態 ${id}`);
      }
    } catch (e) {
      console.error(`[TTStatus] ApplyValue error: ${id}`, e);
    }
  }

  public override async LoadCache(): Promise<void> {
    await super.LoadCache();
    // ロード完了後に全状態の Apply を実行して UI に反映
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
