/**
 * markdownHeadings.ts
 * Monaco エディタ上の Markdown ドキュメントから見出し構造（アウトライン）を解析するユーティリティ。
 *
 * 元は views/TTFocusedPanelActions.ts に同居していたが、TTUIStateManager.ts が
 * こちらから import し、TTFocusedPanelActions.ts も TTUIStateManager.ts を import する
 * 循環依存を生んでいたため、依存を持たない純粋なロジックとして独立させた。
 */
import type { editor as MonacoEditor } from 'monaco-editor';

export interface HeadingAttribute {
  line: number;
  level: number;
  offset: number;
  headingNumber: string;
  isHidden: boolean;
}

export function getHeadingLevel(lineContent: string): number {
  const match = lineContent.match(/^(\s{0,3})(#{1,6})\s/);
  return match ? match[2].length : 0;
}

/**
 * 折畳で隠れている行範囲の一覧を返す。
 *
 * Monaco 0.52 では editor.getHiddenAreas() が非公開化され関数として存在しないため、
 * 折畳モデル（foldingModel.regions）の collapsed 領域から隠れ行範囲を自前算出する。
 * foldingModel/regions は公開型定義に存在しない内部APIのため、この関数内に限り
 * `any` へのアクセスを許容する（Monacoバージョン更新時はここだけ確認すればよい）。
 */
export function getHiddenAreas(editor: MonacoEditor.IStandaloneCodeEditor): Array<{ startLineNumber: number; endLineNumber: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contribution = (editor as any).getContribution?.('editor.contrib.folding');
  const regions = contribution?.foldingModel?.regions;
  if (regions) {
    const areas: Array<{ startLineNumber: number; endLineNumber: number }> = [];
    for (let i = 0; i < regions.length; i++) {
      if (regions.isCollapsed(i)) {
        areas.push({
          startLineNumber: regions.getStartLineNumber(i) + 1,
          endLineNumber: regions.getEndLineNumber(i),
        });
      }
    }
    return areas;
  }
  // フォールバック: 旧 Monaco 公開 API (0.44 未満)
  const legacyGetHiddenAreas = (editor as unknown as { getHiddenAreas?: () => Array<{ startLineNumber: number; endLineNumber: number }> }).getHiddenAreas;
  if (typeof legacyGetHiddenAreas === 'function') {
    return legacyGetHiddenAreas.call(editor) ?? [];
  }
  return [];
}

export function isLineFolded(editor: MonacoEditor.IStandaloneCodeEditor, lineNumber: number): boolean {
  // Monaco 0.52 の同期フィールドは foldingModel（アンダースコアなし）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contribution = (editor as any).getContribution?.('editor.contrib.folding');
  const regions = contribution?.foldingModel?.regions;
  if (regions) {
    for (let i = 0; i < regions.length; i++) {
      if (regions.isCollapsed(i) && regions.getStartLineNumber(i) === lineNumber) {
        return true;
      }
    }
    return false;
  }
  // フォールバック: 旧 Monaco 公開 API (0.44 未満)
  const legacyGetHiddenAreas = (editor as unknown as { getHiddenAreas?: () => Array<{ startLineNumber: number; endLineNumber: number }> }).getHiddenAreas;
  if (typeof legacyGetHiddenAreas === 'function') {
    const hiddenAreas = legacyGetHiddenAreas.call(editor) ?? [];
    const nextLine = lineNumber + 1;
    return hiddenAreas.some(r => nextLine >= r.startLineNumber && nextLine <= r.endLineNumber);
  }
  return false;
}

/** 見出しのfoldスコープ末尾行（次の同位以上の見出しの直前まで） */
export function headingScopeEnd(headings: HeadingAttribute[], idx: number, lineCount: number): number {
  const h = headings[idx];
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level <= h.level) return headings[i].line - 1;
  }
  return lineCount;
}

/**
 * エディタ上のドキュメント（Markdown構造）から各見出しのメタデータを解析し、
 * アウトライン構造やインデックス情報を生成して返します。
 *
 * @param editor Monaco Editor インスタンス
 */
export function getHeadingAttributes(editor: MonacoEditor.IStandaloneCodeEditor): HeadingAttribute[] {
  const model = editor.getModel();
  if (!model) return [];

  const lineCount = model.getLineCount();
  const attributes: HeadingAttribute[] = [];

  // 見出しレベル(1〜6)ごとのカウンター
  const counters = [0, 0, 0, 0, 0, 0];

  // 現在折りたたまれている行を Set にキャッシュして判定を O(1) にする
  const foldedLines = new Set<number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contribution = (editor as any).getContribution?.('editor.contrib.folding');
  const regions = contribution?.foldingModel?.regions;
  if (regions) {
    for (let i = 0; i < regions.length; i++) {
      if (regions.isCollapsed(i)) {
        foldedLines.add(regions.getStartLineNumber(i));
      }
    }
  }

  const checkIsFolded = (line: number) => {
    if (regions) return foldedLines.has(line);
    return isLineFolded(editor, line); // フォールバック
  };

  // 1パス目: 基本情報を収集
  for (let i = 1; i <= lineCount; i++) {
    const lineContent = model.getLineContent(i);
    const level = getHeadingLevel(lineContent);

    if (level > 0) {
      // 累積文字数オフセット(0始まり)を取得
      const offset = model.getOffsetAt({ lineNumber: i, column: 1 });

      // 見出し番号の生成
      counters[level - 1]++;
      // 現在のレベルより深いレベルのカウンターはリセット
      for (let k = level; k < 6; k++) {
        counters[k] = 0;
      }
      const headingNumber = counters.slice(0, level).join('.');

      attributes.push({
        line: i,
        level,
        offset,
        headingNumber,
        isHidden: false,
      });
    }
  }

  // 2パス目: 各見出しの非表示判定
  // 仕様書: 当該行より前（上方向）にある全見出し行 h について、h が折りたたまれており、かつ h の fold スコープ内に対象行が含まれる場合、非表示と判定します。
  // 状態追跡による O(N) 判定アルゴリズム (二重ループおよび scopeEnd 再計算の完全廃止)
  let currentFoldedParentLevel = -1;

  for (let idx = 0; idx < attributes.length; idx++) {
    const target = attributes[idx];

    // もし現在折りたたまれている上位見出しがあり、そのレベルが現在の見出しより上位（数値が小さい）なら非表示
    if (currentFoldedParentLevel !== -1 && target.level > currentFoldedParentLevel) {
      target.isHidden = true;
    } else {
      // そうでなければ非表示ではない。影響範囲（スコープ）から抜けたので折りたたみ状態を解除
      target.isHidden = false;
      currentFoldedParentLevel = -1;
    }

    // この見出し自身が折りたたまれている場合、まだ上位の折りたたみが無ければ、これを最上位 of 折りたたみとする
    if (checkIsFolded(target.line)) {
      if (currentFoldedParentLevel === -1) {
        currentFoldedParentLevel = target.level;
      }
    }
  }

  return attributes;
}
