/**
 * keyboardUtils.ts
 * キーイベント解析・キー文字列正規化ユーティリティ。
 */

export const MOD_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const;

export const KEY_NAME_MAP: Record<string, string> = {
  uparrow:    'arrowup',
  downarrow:  'arrowdown',
  leftarrow:  'arrowleft',
  rightarrow: 'arrowright',
  up:         'arrowup',
  down:       'arrowdown',
  left:       'arrowleft',
  right:      'arrowright',
  esc:        'escape',
};

export function normalizeKeyName(k: string): string {
  const lower = k.toLowerCase();
  return KEY_NAME_MAP[lower] ?? lower;
}

export function normalizeKeyStr(raw: string): string {
  const parts = raw.toLowerCase().trim().split('+').map(p => p.trim()).filter(Boolean);
  const mods   = MOD_ORDER.filter(m => parts.includes(m));
  const nonMod = parts.filter(p => !(MOD_ORDER as readonly string[]).includes(p)).map(normalizeKeyName);
  return [...mods, ...nonMod].join('+');
}

/**
 * key フィールドの複数値を | で分割して返す。
 * リテラルな | を含めたいキーは \| とエスケープする。
 * 例: 'ctrl+z|ctrl+\|' → ['ctrl+z', 'ctrl+|']
 *
 * " はここでは何のエスケープ用途も持たない、ただの1文字として扱う。DefaultShortcut.md自体は
 * RFC4180準拠のCSVとして読み込まれる（tableFormat.ts の parseCsvLine）ため、" を含むキーを
 * 書きたい場合はCSV層のエスケープ規約（フィールド全体を"…"で囲み、内部の"は""と二重化する）
 * だけに従えばよく、ここではそれをさらにエスケープし直す必要はない。
 * 例: key列に `"Ctrl+"""` と書くと、CSV層で `Ctrl+"` に解決され、ここではそのまま
 *     literalな " を含むキーとして扱われる。
 */
export function parseMultiKey(raw: string): string[] {
  const result: string[] = [];
  let current = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && raw[i + 1] === '|') {
      current += '|';
      i++;
    } else if (ch === '|') {
      const k = normalizeKeyStr(current);
      if (k) result.push(k);
      current = '';
    } else {
      current += ch;
    }
  }
  const k = normalizeKeyStr(current);
  if (k) result.push(k);
  return result;
}

export function keyEventToStr(e: KeyboardEvent): string | null {
  const key = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return e.ctrlKey;
    if (m === 'alt')   return e.altKey;
    if (m === 'shift') return e.shiftKey;
    if (m === 'meta')  return e.metaKey;
    return false;
  });
  const keyStr = normalizeKeyName(key);
  return [...mods, keyStr].join('+') || keyStr;
}

export function mouseEventToStr(type: 'click' | 'dblclick' | 'contextmenu', e: MouseEvent): string {
  const keyPart = type === 'dblclick' ? 'left2' : type === 'contextmenu' ? 'right1' : 'left1';
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return e.ctrlKey;
    if (m === 'alt')   return e.altKey;
    if (m === 'shift') return e.shiftKey;
    if (m === 'meta')  return e.metaKey;
    return false;
  });
  return [...mods, keyPart].join('+') || keyPart;
}

/** 修飾キー4種の押下状態のみを表す最小構造（DragEvent/MouseEvent実体を要求しないための型） */
export interface ModifierKeysLike {
  ctrlKey:  boolean;
  altKey:   boolean;
  shiftKey: boolean;
  metaKey:  boolean;
}

/**
 * D&D用の疑似キー文字列を生成する（例: "alt+thinkfiledrag"）。
 * dragType は呼び出し側が渡すドラッグ種別名（ThinkFileDrag / LocalFileDrag / LocalDirDrag 等）で、
 * ネイティブのキー/マウスイベントに存在しない値のため KEY_NAME_MAP には依存せず、
 * 単純に小文字化してキー文字列を組み立てる。
 * e はネイティブイベントに限らず、実効的な修飾キー状態を表す任意のオブジェクトでよい
 * （TTShortcutManager.resolveDragAction() はグローバル追跡値とOR演算した値を渡す）。
 */
export function dragEventToStr(dragType: string, e: ModifierKeysLike): string {
  const keyPart = dragType.toLowerCase();
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return e.ctrlKey;
    if (m === 'alt')   return e.altKey;
    if (m === 'shift') return e.shiftKey;
    if (m === 'meta')  return e.metaKey;
    return false;
  });
  return [...mods, keyPart].join('+') || keyPart;
}

/**
 * OSファイルシステムからのD&D（Files）が、ファイル/ディレクトリのどちらを含むかを判定する。
 * File API（DataTransfer.files）にはディレクトリ判定用のプロパティが無いため、
 * DataTransferItem.webkitGetAsEntry() が返す FileSystemEntry.isDirectory を見る
 * （Chromium/Electronでは dragenter/dragover 中でも呼び出せる）。
 * ディレクトリを1件でも含めば 'LocalDirDrag'、全件ファイルなら 'LocalFileDrag'、
 * Filesドラッグでなければ（URL/テキストドラッグ等） null を返す。
 */
export type LocalDragKind = 'LocalFileDrag' | 'LocalDirDrag';

export function detectLocalDragKind(dataTransfer: DataTransfer): LocalDragKind | null {
  if (!dataTransfer.types.includes('Files')) return null;
  const items = dataTransfer.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) return 'LocalDirDrag';
  }
  return 'LocalFileDrag';
}

export function wheelEventToStr(e: WheelEvent): string {
  const keyPart = e.deltaY < 0 ? 'wheelup' : 'wheeldown';
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return e.ctrlKey;
    if (m === 'alt')   return e.altKey;
    if (m === 'shift') return e.shiftKey;
    if (m === 'meta')  return e.metaKey;
    return false;
  });
  return [...mods, keyPart].join('+') || keyPart;
}

export function currentModStr(e: Event): string {
  const ev = e as KeyboardEvent | MouseEvent | WheelEvent;
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return ev.ctrlKey;
    if (m === 'alt')   return ev.altKey;
    if (m === 'shift') return ev.shiftKey;
    if (m === 'meta')  return ev.metaKey;
    return false;
  });
  return mods.join('+') || '-';
}
