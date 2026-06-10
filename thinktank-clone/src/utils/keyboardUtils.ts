// キーコード・マウス・ホイールの文字列正規化・分割（仕様書04 §3.1）

/** モディファイアを ctrl+alt+shift+meta の順に固定して正規化する */
export function normalizeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (e.metaKey) parts.push('meta');
  let key = e.key.toLowerCase();
  if (key === ' ') key = 'space';
  if (['control', 'alt', 'shift', 'meta'].includes(key)) return '';
  parts.push(key);
  return parts.join('+');
}

function modifierPrefix(e: MouseEvent | WheelEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (e.metaKey) parts.push('meta');
  return parts.length ? parts.join('+') + '+' : '';
}

/** クリック → left1 / ダブルクリック → left2 / 右クリック → right1 */
export function normalizeMouseEvent(e: MouseEvent, clickCount: number): string {
  const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
  return `${modifierPrefix(e)}${button}${clickCount}`;
}

/** 上スクロール → wheelup / 下スクロール → wheeldown */
export function normalizeWheelEvent(e: WheelEvent): string {
  return `${modifierPrefix(e)}${e.deltaY < 0 ? 'wheelup' : 'wheeldown'}`;
}

/**
 * `ctrl+z|ctrl+y` のような複数キー定義を分割する。
 * ダブルクォート囲みはエスケープとして扱う（例: `"ctrl+|"`）。
 */
export function splitKeyDefs(def: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < def.length; i++) {
    const c = def[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (c === '|' && !inQuote) {
      if (current) result.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current) result.push(current.trim());
  return result;
}
