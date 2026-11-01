/**
 * defaultDictionary.ts
 * docs/DefaultDictionary.yaml をビルド時に取り込み、モジュール読み込み時（＝起動時）にパースして持つ辞書。
 * Vault メモ（ThinktankDictionary）による上書きはトップレベルのキー単位で重ねる
 * （TextEditor.Dictionary.Load / Reset / Save。views/actions/textEditorDictionaryActions.ts）。
 *
 * 各所からは getDictionary() / lookupDictionary() / lookupDictionaryString() で参照する。
 * 値の変化を追いたい場合は onDictionaryChange() で購読する。
 */
import yaml from 'js-yaml';
import defaultDictionaryContent from '../../docs/DefaultDictionary.yaml?raw';

export type DictionaryValue = unknown;
export type Dictionary = Record<string, DictionaryValue>;

/**
 * YAML テキストを辞書としてパースする。
 * 空・コメントだけ・トップレベルがマッピングでない場合は空の辞書、YAML として壊れている場合は例外を投げる。
 */
export function parseDictionary(text: string): Dictionary {
  const loaded = yaml.load(text, { schema: yaml.CORE_SCHEMA });
  if (loaded === null || loaded === undefined) return {};
  if (typeof loaded !== 'object' || Array.isArray(loaded)) return {};
  return loaded as Dictionary;
}

/** 辞書を YAML テキストに書き出す（TextEditor.Dictionary.Save 用）。空なら `{}` */
export function serializeDictionary(dict: Dictionary): string {
  if (Object.keys(dict).length === 0) return '{}\n';
  return yaml.dump(dict, { lineWidth: -1, noRefs: true, schema: yaml.CORE_SCHEMA });
}

function parseDefault(): Dictionary {
  try {
    return parseDictionary(defaultDictionaryContent);
  } catch (err) {
    console.error('[defaultDictionary] docs/DefaultDictionary.yaml を読み込めません:', err);
    return {};
  }
}

/** docs/DefaultDictionary.yaml の内容（起動時に1回だけパースする） */
export const DEFAULT_DICTIONARY: Readonly<Dictionary> = Object.freeze(parseDefault());

/** Vaultメモ（ThinktankDictionary）由来の上書き分 */
let _override: Dictionary | null = null;
/** 既定値と上書きを重ねた結果のキャッシュ */
let _merged: Dictionary = { ...DEFAULT_DICTIONARY };

const _listeners = new Set<() => void>();

function rebuild(): void {
  _merged = { ...DEFAULT_DICTIONARY, ...(_override ?? {}) };
  for (const listener of _listeners) {
    try { listener(); } catch (err) { console.error('[defaultDictionary] listener error:', err); }
  }
}

/** 現在有効な辞書（既定値に Vault メモの上書きを重ねたもの）。変更しないこと */
export function getDictionary(): Readonly<Dictionary> {
  return _merged;
}

/**
 * キーで値を引く。トップレベルにそのキーがあればそれを返し、
 * 無ければ "親.子" のドット区切りとして入れ子をたどる。見つからなければ undefined。
 */
export function lookupDictionary(key: string): DictionaryValue | undefined {
  if (Object.prototype.hasOwnProperty.call(_merged, key)) return _merged[key];
  let node: unknown = _merged;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** 値が文字列・数値・真偽値なら文字列で返す。それ以外（未登録・リスト・マッピング）は undefined */
export function lookupDictionaryString(key: string): string | undefined {
  const value = lookupDictionary(key);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/** 登録されているトップレベルのキー一覧（記述順。上書きで増えたキーは末尾） */
export function dictionaryKeys(): string[] {
  return Object.keys(_merged);
}

/** Vaultメモ由来の辞書で上書きする（トップレベルのキーが一致する項目だけ置き換える） */
export function applyDictionaryOverride(dict: Dictionary): void {
  _override = { ...dict };
  rebuild();
}

/** 上書きを解除し、既定値（docs/DefaultDictionary.yaml）に戻す */
export function resetDictionaryOverride(): void {
  _override = null;
  rebuild();
}

/** 辞書の変化（上書き・リセット）を購読する。戻り値で解除する */
export function onDictionaryChange(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}
