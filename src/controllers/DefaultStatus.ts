import type { TTModels } from '../models/TTModels';

/**
 * DefaultStatus
 *
 * アプリケーション全体の初期状態を TTStatus に登録する。
 * TTApplication.Initialize() から呼び出される。
 *
 * StateID 命名規則:
 *   Application.*         - アプリ全体状態
 *   Column{N}.*           - 列固有状態（N=0/1/2）
 *   {StateID}             - グローバルモードフラグ（bool: 'true'/'false'）
 *
 * コンテキスト文字列での利用:
 *   {ColumnType}-{PanelType}-{PanelTool}-{Status}
 *   例: Left-DataGrid-Main-ChatMode  （ChatMode='true' の列でDataGridMainにフォーカス）
 */
export function InitializeDefaultStatus(models: TTModels): void {
  const s = models.Status;

  // ─── アプリケーション全体 ───────────────────────────────────────

  /** アクティブ列 (Column1/Column2/Column3) */
  s.RegisterState(
    'Application.ActiveColumn',
    'アクティブ列',
    'Column1',
  );

  // ─── 列固有状態（[Columns]ワイルドカードで0/1/2に展開） ──────────

  /** 列フォーカス有無 */
  s.RegisterState(
    'Column[Columns].Focus',
    'Column[Columns]フォーカス',
    'false',
  );

  /** 列フォーカス中パネル（DataGrid / WebView / TextEditor） */
  s.RegisterState(
    'Column[Columns].Panel',
    'Column[Columns]フォーカスパネル',
    'DataGrid',
  );

  /** 列フォーカス中ツール（Main / Tool） */
  s.RegisterState(
    'Column[Columns].UI',
    'Column[Columns]フォーカスツール',
    'Main',
  );

  // ─── グローバルモードフラグ ──────────────────────────────────────

  /** チャットモード（bool: 'true'/'false'） */
  s.RegisterState(
    'ChatMode',
    'チャットモード',
    'false',
  );
}
