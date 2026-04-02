import { TTObject } from '../models/TTObject';
import { TTModels } from '../models/TTModels';
import { TTColumn } from './TTColumn';
import type { ColumnIndex } from '../types';

/**
 * コンテキストメニュー項目
 */
export interface ContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
}

/**
 * コンテキストメニュー状態
 */
export interface ContextMenuState {
  items: ContextMenuItem[];
  x: number;
  y: number;
}

/**
 * コマンドパレット項目
 */
export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  onClick: () => void;
}

/**
 * コマンドパレット状態
 */
export interface CommandPaletteState {
  visible: boolean;
  items: CommandPaletteItem[];
  placeholder?: string;
}

/**
 * 列間レイアウト比率
 */
export interface ColumnLayoutRatios {
  /** Column0の幅比率 (0-1) */
  column0: number;
  /** Column1の幅比率 (0-1) */
  column1: number;
  /** Column2の幅比率 (0-1) */
  column2: number;
}

/**
 * TTApplication - 最上位コントローラ（シングルトン）
 *
 * 最大3つのTTColumnを管理し、アプリケーション全体の
 * フォーカス管理、イベントディスパッチ、レイアウト制御を行う。
 */
export class TTApplication extends TTObject {
  private static _instance: TTApplication;

  /** 3列のカラム */
  public Columns: [TTColumn, TTColumn, TTColumn];

  /** アクティブ列のインデックス */
  private _activeColumnIndex: ColumnIndex = 0;

  /** コンテキストメニュー状態 */
  public ContextMenu: ContextMenuState | null = null;

  /** コマンドパレット状態 */
  public CommandPalette: CommandPaletteState | null = null;

  /** 列間レイアウト比率 */
  public ColumnRatios: ColumnLayoutRatios = {
    column0: 0.33,
    column1: 0.34,
    column2: 0.33,
  };

  /** 表示列数（レスポンシブ: 1/2/3） */
  private _visibleColumnCount: 1 | 2 | 3 = 3;

  /** 最後に実行されたアクションID（デバッグ用） */
  public LastActionID: string = '';

  /** 最後のキー入力文字列（デバッグ用） */
  public LastKeyString: string = '';

  /** データモデルルート */
  public get Models(): TTModels {
    return TTModels.Instance;
  }

  public override get ClassName(): string {
    return 'TTApplication';
  }

  private constructor() {
    super();
    this.ID = 'Application';
    this.Name = 'Thinktank Application';

    // 3列を生成
    this.Columns = [
      new TTColumn(0),
      new TTColumn(1),
      new TTColumn(2),
    ];

    // デフォルトでColumn0にMemosを表示
    this.Columns[0].DataGridResource = 'Memos';
    this.Columns[1].DataGridResource = 'Memos';
    this.Columns[2].DataGridResource = 'Memos';

    // レスポンシブ初期化
    this._updateVisibleColumns();
  }

  // ═══════════════════════════════════════════════════════════════
  // シングルトン
  // ═══════════════════════════════════════════════════════════════

  public static get Instance(): TTApplication {
    if (!TTApplication._instance) {
      TTApplication._instance = new TTApplication();
    }
    return TTApplication._instance;
  }

  /** テスト用：インスタンスをリセット */
  public static resetInstance(): void {
    TTApplication._instance = undefined as unknown as TTApplication;
  }

  // ═══════════════════════════════════════════════════════════════
  // アクティブ列管理
  // ═══════════════════════════════════════════════════════════════

  /** アクティブ列インデックス */
  public get ActiveColumnIndex(): ColumnIndex {
    return this._activeColumnIndex;
  }

  public set ActiveColumnIndex(value: ColumnIndex) {
    if (this._activeColumnIndex === value) return;
    this._activeColumnIndex = value;
    this.NotifyUpdated(false);
  }

  /** アクティブ列を取得 */
  public get ActiveColumn(): TTColumn {
    return this.Columns[this._activeColumnIndex];
  }

  /** 列インデックスで列を取得 */
  public GetColumn(index: ColumnIndex): TTColumn {
    return this.Columns[index];
  }

  /** 次の列をアクティブに */
  public ActivateNextColumn(): void {
    const next = ((this._activeColumnIndex + 1) % this._visibleColumnCount) as ColumnIndex;
    this.ActiveColumnIndex = next;
  }

  /** 前の列をアクティブに */
  public ActivatePreviousColumn(): void {
    const prev = ((this._activeColumnIndex - 1 + this._visibleColumnCount) % this._visibleColumnCount) as ColumnIndex;
    this.ActiveColumnIndex = prev;
  }

  // ═══════════════════════════════════════════════════════════════
  // レスポンシブ列表示制御
  // ═══════════════════════════════════════════════════════════════

  /** 表示列数 */
  public get VisibleColumnCount(): 1 | 2 | 3 {
    return this._visibleColumnCount;
  }

  /** ウィンドウ幅に基づいて表示列数を更新 */
  public UpdateLayout(windowWidth: number): void {
    let newCount: 1 | 2 | 3;
    if (windowWidth < 768) {
      newCount = 1;     // スマホ
    } else if (windowWidth < 1200) {
      newCount = 2;     // タブレット
    } else {
      newCount = 3;     // デスクトップ
    }

    if (newCount !== this._visibleColumnCount) {
      this._visibleColumnCount = newCount;
      this._updateVisibleColumns();
      this.NotifyUpdated(false);
    }
  }

  /** 表示列数に基づいて各列の可視性を更新 */
  private _updateVisibleColumns(): void {
    this.Columns[0].IsVisible = true;
    this.Columns[1].IsVisible = this._visibleColumnCount >= 2;
    this.Columns[2].IsVisible = this._visibleColumnCount >= 3;

    // アクティブ列が非表示になった場合は0に戻す
    if (!this.Columns[this._activeColumnIndex].IsVisible) {
      this._activeColumnIndex = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // イベントディスパッチ（Phase 21で完全実装）
  // ═══════════════════════════════════════════════════════════════

  /**
   * キーイベントからアクションを検索・実行する
   * Phase 21でDefaultEventsとの統合を実装
   */
  public DispatchKeyEvent(_key: string, _mods: string[]): boolean {
    // Phase 21で実装
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 初期化
  // ═══════════════════════════════════════════════════════════════

  /**
   * アプリケーション初期化
   * Phase 21でDefaultStatus/Actions/Eventsの初期化を追加
   */
  public Initialize(): void {
    console.log('[TTApplication] Initialized');
    console.log(`[TTApplication] Columns: ${this.Columns.map(c => c.ID).join(', ')}`);
    console.log(`[TTApplication] Models: ${this.Models.ID}`);
  }
}
