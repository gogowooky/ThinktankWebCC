/**
 * statusActionBinding.ts
 * Status・Action の仕様（docs/status-action/ の番号付きファイル）を、番号順につなげた1つの文字列にする。
 * Status の初期値（TTUIStateManager）と Action の説明（actionDescriptions.ts）がこれを読む。
 * README.md は書式の説明なので読み込まない。
 */

const parts = import.meta.glob('../../docs/status-action/[0-9]*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// 各ファイルは改行で終わるので、そのままつなげれば分割前の1ファイルと同じ文字列になる
export const STATUS_ACTION_BINDING: string = Object.keys(parts)
  .sort()
  .map(path => parts[path])
  .join('');
