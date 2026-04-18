/**
 * TTState.ts
 * アプリ状態の1エントリ。TTStatus に登録して使用する。
 *
 * Phase 3: 基本実装（Value / Apply / Default）
 * Phase 30 以降: Apply / Watch / Calculate を UI に接続
 */

import { TTObject } from './TTObject';
import type { TTStateConfig } from '../types';

export class TTState extends TTObject {
  public Description: string = '';

  private _value: string = '';
  private _default: (id: string) => string = () => '';
  private _test: (id: string, value: string) => boolean = () => true;
  private _apply: (id: string, value: string) => void = () => {};
  private _watch: (id: string) => void = () => {};
  private _calculate: ((id: string) => string) | null = null;

  public override get ClassName(): string {
    return 'TTState';
  }

  constructor(id: string = '', description: string = '', config?: string | TTStateConfig) {
    super();
    this.ID = id;
    this.Name = id;
    this.Description = description;
    this.UpdateDate = this.getNowString();

    if (typeof config === 'string') {
      // 文字列はデフォルト値として扱う
      this._value = config;
      this._default = () => config;
    } else if (config) {
      this._default = config.Default ?? (() => '');
      this._value = this._default(this.ID);
      this._test = config.Test ?? (() => true);
      this._apply = config.Apply ?? (() => {});
      this._watch = config.Watch ?? (() => {});
      this._calculate = config.Calculate ?? null;
    }

    // Watch（イベント監視）を開始
    this._watch(this.ID);
  }

  /**
   * 現在値を取得する。
   * Calculate が設定されている場合はその結果を返す（算出プロパティ）。
   */
  public get Value(): string {
    return this._calculate ? this._calculate(this.ID) : this._value;
  }

  public set Value(value: string) {
    this._value = value;
  }

  /** デフォルト値を返す */
  public get DefaultValue(): string {
    return this._default(this.ID);
  }

  /** 値の妥当性チェック */
  public Test(value: string): boolean {
    return this._test(this.ID, value);
  }

  /**
   * Apply 関数を実行して UI に反映する。
   * Phase 30 以降: Apply 関数が具体的な DOM/React 操作を行う。
   */
  public Apply(value: string): void {
    this._apply(this.ID, value);
  }
}
