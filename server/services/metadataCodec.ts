/**
 * metadataCodec.ts
 * BigQuery vault_ver2.metadata 列のデコード共通処理。
 *
 * metadata 列がネイティブ JSON 型の場合、そこに格納した「JSON文字列スカラー」
 * （YAMLテキストを JSON.stringify で包んだもの。BigQueryService.encodeMetadata 参照）を
 * BigQueryクライアントは JSON テキスト表現のまま返す（例: '"editor:\n  ..."'）。
 * これを yaml.load にそのまま渡すと、ダブルクォートで囲まれた1つのYAMLスカラーとして
 * 解釈され、中身が展開されずに文字列のまま返ってしまう。
 * そのため、ダブルクォートで始まる場合は先に JSON.parse で一段アンラップしてから
 * yaml.load する。旧データ（JSONオブジェクトのテキスト表現、例: '{"editor":{...}}'）は
 * JSON も YAML のサブセットなのでそのまま yaml.load で正しく読める。
 */
import yaml from 'js-yaml';

export function decodeMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || raw === '') return undefined;
  let text = raw;
  if (text.startsWith('"')) {
    try { text = JSON.parse(text); } catch { /* JSON文字列スカラーでなければそのままYAML解釈を試みる */ }
  }
  const decoded: unknown = yaml.load(text);
  return (decoded && typeof decoded === 'object' && !Array.isArray(decoded))
    ? decoded as Record<string, unknown>
    : undefined;
}
