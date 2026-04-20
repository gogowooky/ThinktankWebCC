import { TTObject } from './TTObject';
import type { StateConfig } from '../types';

/**
 * TTState - UI状態の個別エントリ
 *
 * 各状態は ID, Value, Description を持ち、
 * Default/Test/Apply/Watch のコールバックで動作をカスタマイズできる。
 */
export class TTState extends TTObject {
  /** 値 */
  private _value: string = '';

  /** 説明 */
  public Description: string = '';

  /** デフォルト値取得関数 */
  protected _default: (id: string) => string = () => '';

  /** バリデーション関数 */
  protected _test: (id: string, value: string) => boolean = () => true;

  /** ビューへの適用関数 */
  protected _applyToView: (id: string, value: string) => void = () => {};

  /** イベント監視開始関数 */
  protected _watch: (id: string) => void = () => {};

  /** 計算値関数（設定時、Valueは計算結果を返す） */
  protected _calculate: ((id: string) => string) | null = null;

  public override get ClassName(): string {
    return 'TTState';
  }

  constructor(id: string = '', description: string = '', config?: string | StateConfig) {
    super();
    this.ID = id;
    this.Name = id;
    this.Description = description;

    if (typeof config === 'string') {
      this._value = config;
      this._default = () => config;
    } else if (config) {
      this._default = config.Default || (() => '');
      this._value = this._default(this.ID);
      this._test = config.Test || (() => true);
      this._applyToView = config.Apply || (() => {});
      this._watch = config.Watch || (() => {});
    }

    // 監視を開始
    this._watch(this.ID);
  }

  /** 値を取得（_calculateが設定されている場合はその結果を返す） */
  public get Value(): string {
    if (this._calculate) {
      return this._calculate(this.ID);
    }
    return this._value;
  }

  /** 値を設定 */
  public set Value(value: string) {
    this._value = value;
  }

  /** デフォルト値を取得 */
  public get DefaultValue(): string {
    return this._default(this.ID);
  }

  /** 値をビューに適用 */
  public Apply(value: string): void {
    this._applyToView(this.ID, value);
  }
}
