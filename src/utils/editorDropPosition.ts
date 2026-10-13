/**
 * editorDropPosition.ts
 * D&D 中のマウス位置から、Monaco エディタのカーソルを送る位置を求める（DiscussPanel の Alt+Think ドロップの挿入位置プレビュー）。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Monaco エディタは公開型に無い API（折り畳みモデル）も使うため any で受ける */
import { getHiddenAreas } from './markdownHeadings';

/**
 * 画面座標(clientX/clientY)からMonacoエディタ上のモデル位置を求める。
 * editor.getTargetAtClientPoint() を優先するが、環境（ブラウザ/描画パイプライン）依存で
 * ヒットテストが機能しないケースがあるため、スクロール位置・行の高さ・文字幅から
 * 幾何計算で求めるフォールバックを用意する（等幅フォント前提のため厳密ではないが、
 * ドラッグ中のカーソル追従プレビュー用途としては十分な精度）。
 */
export function clientPointToPosition(editor: any, clientX: number, clientY: number): { lineNumber: number; column: number } | null {
  // ドラッグ中はこの位置へカーソルを送る。折り畳まれて隠れた行へ送ると Monaco がその折り畳みを
  // 開いてしまうため、隠れた行は数えず、それでも隠れた行に当たったら見出し行の末尾へ寄せる。
  const hidden = mergedHiddenAreas(editor);
  const model = editor.getModel?.();

  const viaApi = editor.getTargetAtClientPoint?.(clientX, clientY)?.position;
  if (viaApi) return model ? avoidHiddenLine(model, hidden, viaApi) : viaApi;

  const domNode = editor.getDomNode?.();
  const monacoNs = (window as any).monaco;
  if (!domNode || !model || !monacoNs) return null;

  const rect = domNode.getBoundingClientRect();
  const layoutInfo = editor.getLayoutInfo();
  const lineHeight = editor.getOption(monacoNs.editor.EditorOption.lineHeight) || 20;
  const fontInfo = editor.getOption(monacoNs.editor.EditorOption.fontInfo);
  const charWidth = fontInfo?.typicalHalfwidthCharacterWidth || 7;

  // 画面上の行（見えている行の何行目か）を、隠れた行を飛ばしてモデルの行番号に直す
  const relY = clientY - rect.top + editor.getScrollTop();
  let lineNumber = Math.max(1, Math.floor(relY / lineHeight) + 1);
  for (const area of hidden) {
    if (area.startLineNumber <= lineNumber) lineNumber += area.endLineNumber - area.startLineNumber + 1;
  }
  lineNumber = Math.min(model.getLineCount(), lineNumber);

  const relX = clientX - rect.left - layoutInfo.contentLeft + editor.getScrollLeft();
  const lineLength = model.getLineContent(lineNumber).length;
  const column = Math.min(lineLength + 1, Math.max(1, Math.round(relX / charWidth) + 1));

  return avoidHiddenLine(model, hidden, { lineNumber, column });
}

/** 折り畳みで隠れている行範囲（入れ子の折り畳みは外側に吸収して、重なりの無い昇順にする） */
function mergedHiddenAreas(editor: any): Array<{ startLineNumber: number; endLineNumber: number }> {
  const areas = [...getHiddenAreas(editor)].sort((a, b) => a.startLineNumber - b.startLineNumber);
  const merged: Array<{ startLineNumber: number; endLineNumber: number }> = [];
  for (const a of areas) {
    const last = merged[merged.length - 1];
    if (last && a.startLineNumber <= last.endLineNumber + 1) last.endLineNumber = Math.max(last.endLineNumber, a.endLineNumber);
    else merged.push({ ...a });
  }
  return merged;
}

/** 隠れた行に当たった位置を、その折り畳みの見出し行（隠れた範囲の直前の行）の末尾へ寄せる */
function avoidHiddenLine(
  model: any,
  hidden: Array<{ startLineNumber: number; endLineNumber: number }>,
  pos: { lineNumber: number; column: number },
): { lineNumber: number; column: number } {
  const area = hidden.find(a => pos.lineNumber >= a.startLineNumber && pos.lineNumber <= a.endLineNumber);
  if (!area) return pos;
  const lineNumber = Math.max(1, area.startLineNumber - 1);
  return { lineNumber, column: model.getLineMaxColumn(lineNumber) };
}
