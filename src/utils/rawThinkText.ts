/**
 * rawThinkText.ts
 * TextEditor の「YAML＋本文」表示（Pane の TextEditor アイコンを Shift+Click）で使う変換。
 *
 * 保存先の形式（electron/mdFormat.cjs の frontmatter / BigQuery の各列）と同じく、
 * 基本項目と metadata を1つの YAML frontmatter にまとめ、その後ろに本文を置く。
 *   ---
 *   thinkid / category / title / keywords / related_ids / updated_at   … 基本項目
 *   <metadata の各キー>                                                … Think.Metadata
 *   ---
 *   <本文（タイトル行を除く）>
 *
 * 保存時に書き戻すのは title / keywords / related_ids / metadata だけ。
 * thinkid・category・updated_at は保存先が管理する値なので、表示はしても書き換えは無視する。
 */

import yaml from 'js-yaml';
import { splitContent } from './thinkFormat';

/** 変換に必要な Think の項目（TTThink の部分集合） */
export interface RawThinkSource {
  ID:          string;
  ContentType: string;
  Content:     string;
  Keywords:    string;
  RelatedIDs:  string;
  UpdatedAt:   string;
  Metadata:    Record<string, unknown>;
}

/** YAML の先頭に置く基本項目。metadata 側に同名キーがあっても基本項目として扱う */
const BASE_KEYS = ['thinkid', 'category', 'title', 'keywords', 'related_ids', 'size_bytes', 'is_deleted', 'created_at', 'updated_at'];

export interface RawThinkFields {
  /** Content の1行目（保存先の title 列） */
  title:      string;
  body:       string;
  keywords:   string;
  relatedIds: string;
  metadata:   Record<string, unknown>;
}

export function toRawThinkText(think: RawThinkSource): string {
  const { title, body } = splitContent(think.Content);
  const front: Record<string, unknown> = {
    thinkid:     think.ID,
    category:    think.ContentType,
    title,
    keywords:    think.Keywords,
    related_ids: think.RelatedIDs,
    updated_at:  think.UpdatedAt,
  };
  for (const [k, v] of Object.entries(think.Metadata ?? {})) {
    if (!BASE_KEYS.includes(k)) front[k] = v;
  }
  return `---\n${yaml.dump(front, { lineWidth: -1 })}---\n${body}`;
}

/** YAML＋本文を解釈する。形式が壊れていれば error を返す（呼び出し側は保存しない） */
export function parseRawThinkText(text: string): RawThinkFields | { error: string } {
  const lines = text.split(/\r\n|\n/);
  if (lines[0] !== '---') return { error: '先頭行が --- ではありません' };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { error: 'YAML の終わりの --- がありません' };

  let front: unknown;
  try {
    // 既定スキーマは日付らしき値を Date に変えてしまい、metadata の値の型が保存のたびに変わる
    front = yaml.load(lines.slice(1, end).join('\n'), { schema: yaml.CORE_SCHEMA }) ?? {};
  } catch (e) {
    return { error: `YAML を解釈できません: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}` };
  }
  if (typeof front !== 'object' || front === null || Array.isArray(front)) {
    return { error: 'YAML はキーと値の組で書いてください' };
  }

  const fm = front as Record<string, unknown>;
  const metadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!BASE_KEYS.includes(k)) metadata[k] = v;
  }
  return {
    title:      scalarText(fm.title),
    body:       lines.slice(end + 1).join('\n'),
    keywords:   scalarText(fm.keywords),
    relatedIds: scalarText(fm.related_ids),
    metadata,
  };
}

/** 解釈結果から Think.Content（タイトル行＋本文）を組み立てる */
export function rawFieldsToContent(fields: RawThinkFields): string {
  return fields.body ? `${fields.title}\n${fields.body}` : fields.title;
}

/**
 * テキストが Think の現在の状態と同じ内容を表すか。
 * 保存後に YAML を整形し直した文字列でエディタを上書きすると入力中のカーソルが飛ぶため、
 * 書式の違いだけなら上書きしない判定に使う。
 */
export function rawTextMatchesThink(text: string, think: RawThinkSource): boolean {
  const fields = parseRawThinkText(text);
  if ('error' in fields) return false;
  return rawFieldsToContent(fields) === think.Content
    && fields.keywords === (think.Keywords ?? '')
    && fields.relatedIds === (think.RelatedIDs ?? '')
    && JSON.stringify(fields.metadata) === JSON.stringify(withoutBaseKeys(think.Metadata));
}

function withoutBaseKeys(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata ?? {})) if (!BASE_KEYS.includes(k)) out[k] = v;
  return out;
}

function scalarText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}
