/**
 * editorJump.ts
 * 「Thinkを開いてカーソルを送り、編集を始められる状態にする」を、開く側（アクション）と
 * 表示側（TextEditorMedia）で受け渡すための小さな受け皿。
 *
 * 開いた直後はエディタがまだマウントされておらず、マウント後も TextEditorMedia が
 * 折畳と保存済みカーソルを非同期に復元する。呼び出し側から位置やフォーカスを当てにいくと
 * その復元に上書きされるので、依頼だけを預けて復元処理の最後に適用させる。
 */

import { findHighlightRanges, type HighlightModel } from './highlightMatches';

/** 行番号での指定（[THINK:id,12]）か、検索語での指定（[THINK:id,abc]）。 */
export type EditorJump =
  | { kind: 'line'; line: number }
  | { kind: 'search'; word: string };

/** 開いた直後にエディタへさせること。行き先の指定が無くてもフォーカスは当てる。 */
export interface EditorOpenRequest {
  /** カーソルの行き先。未指定なら保存済みの位置のまま。 */
  jump?: EditorJump;
}

/** ThinkID → 適用待ちの依頼。マウント時に取り出して消える。 */
const pending = new Map<string, EditorOpenRequest>();

/** 次にこのThinkのエディタがマウントされたとき、行き先へ送ってフォーカスする。 */
export function requestEditorOpen(thinkId: string, jump?: EditorJump): void {
  pending.set(thinkId, { jump });
}

/** 預かった依頼を取り出す（取り出しで消し、次のマウントには持ち越さない）。 */
export function takeEditorOpen(thinkId: string): EditorOpenRequest | undefined {
  const request = pending.get(thinkId);
  if (request) pending.delete(thinkId);
  return request;
}

export interface JumpEditor {
  getModel(): (HighlightModel & { getLineCount(): number }) | null;
}

/**
 * 行き先の実際のカーソル位置を求める。
 * 行番号は本文の範囲へ丸める。検索語がどこにも無いときは null を返し、
 * 呼び出し側でカーソルを動かさない（開いた位置のままにする）。
 */
export function jumpPosition(editor: JumpEditor, jump: EditorJump): { lineNumber: number; column: number } | null {
  if (jump.kind === 'line') {
    const lineCount = editor.getModel()?.getLineCount() ?? jump.line;
    return { lineNumber: Math.min(Math.max(1, jump.line), lineCount), column: 1 };
  }
  const first = findHighlightRanges(editor, jump.word)[0];
  return first ? { lineNumber: first.startLineNumber, column: first.startColumn } : null;
}
