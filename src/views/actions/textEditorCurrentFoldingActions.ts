/**
 * textEditorCurrentFoldingActions.ts
 * TextEditor.CurrentEditor.Folding:* アクション（見出しレベル指定での一括開閉）の登録。
 */
import type { TTApplication } from '../TTApplication';
import type { TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { type HeadingAttribute, getHeadingAttributes } from '../../utils/markdownHeadings';
import { getErrorMessage } from '../../utils/errorMessage';

interface FoldingContext {
  editor: any;
  model: any;
  pos: any;
  headings: HeadingAttribute[];
  targetOffset: number;
}

function getFoldingContext(item: TTActionItem): FoldingContext | null {
  const editor = TTShortcutManager.instance.activeEditor;
  if (!editor) { item.Result = '[エディタ未選択]'; return null; }
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) { item.Result = '[モデル/位置なし]'; return null; }
  const headings = getHeadingAttributes(editor);
  const targetOffset = model.getOffsetAt(pos);
  return { editor, model, pos, headings, targetOffset };
}

/** カーソル位置が所属する直近のHeading（自身含む）を取得。見出しの外側ならnull */
function getGoverningHeading(ctx: FoldingContext): HeadingAttribute | null {
  const matched = ctx.headings.filter(h => h.offset <= ctx.targetOffset);
  return matched.length > 0 ? matched[matched.length - 1] : null;
}

/** 指定オフセット以前（自身含む）で、レベルが maxLevel 以下の直近のHeadingを取得する */
function findAncestorAtOrAboveLevel(headings: HeadingAttribute[], offset: number, maxLevel: number): HeadingAttribute | null {
  const candidates = headings.filter(h => h.offset <= offset && h.level <= maxLevel);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

/**
 * カーソルが所属するHeading行のレベルが moveTargetLevel 以上の場合、
 * moveTargetLevel 以下の直近の祖先Heading行へ移動する（そのレベル自身が閉じられて
 * 見えなくなる前に、カーソルを表示され続ける行へ退避させるため）。
 */
function moveOutOfClosingScopeTo(ctx: FoldingContext, moveTargetLevel: number): void {
  const { editor, headings, targetOffset } = ctx;
  const governing = getGoverningHeading(ctx);
  if (!governing || governing.level < moveTargetLevel) return;
  const ancestor = findAncestorAtOrAboveLevel(headings, targetOffset, moveTargetLevel);
  if (ancestor) {
    editor.setPosition({ lineNumber: ancestor.line, column: 1 });
    editor.revealLineInCenterIfOutsideViewport(ancestor.line);
  }
}

/**
 * Level < closeFromLevel のHeading行をOpenに、Level >= closeFromLevel のHeading行をCloseにする。
 * ただし、子Heading行を一つも持たないHeading行（それより深いレベルの見出しが
 * 配下に存在しない、＝開いても見出し構造として展開されるものがない行）は、
 * レベルに関わらずCloseとする。
 *
 * Monacoの 'editor.fold'/'editor.unfold' コマンド（selectionLines指定）は、対象行自身の
 * fold領域が既に目的の状態のときに「まだ目的の状態でない最初の祖先」へ処理対象を
 * すり替える仕様（VSCodeの単一カーソル位置向けの挙動）を持つため、複数行を一括で
 * 特定の開閉状態に揃えたい本用途では、既に閉じている子Heading（Level3等）の存在に
 * 引きずられて、開いたままにしたい祖先Heading（Level1,2等）まで誤って畳んでしまう
 * ことがある。これを避けるため、foldingModelを直接操作し、Heading行ごとに「自分自身の
 * fold領域」のisCollapsedのみを見て目的の状態と異なるものだけをtoggleする。
 */
function setFoldStateByLevel(editor: any, headings: HeadingAttribute[], closeFromLevel: number): { openCount: number; closeCount: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contribution = (editor as any).getContribution?.('editor.contrib.folding');
  const foldingModel = contribution?.foldingModel;
  let openCount = 0;
  let closeCount = 0;
  if (!foldingModel) return { openCount, closeCount };

  const toToggle: any[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const region = foldingModel.getRegionAtLine(h.line);
    if (!region) continue;
    // headingsは行順に並んでいるため、直後の要素が自分より深いレベルであれば
    // それは自分の子（間に同レベル以下の見出しが挟まっていない）と判定できる。
    const hasChildHeading = i + 1 < headings.length && headings[i + 1].level > h.level;
    const desiredCollapsed = h.level >= closeFromLevel || !hasChildHeading;
    if (desiredCollapsed) closeCount++; else openCount++;
    if (region.isCollapsed !== desiredCollapsed) {
      toToggle.push(region);
    }
  }
  if (toToggle.length > 0) {
    foldingModel.toggleCollapseState(toToggle);
  }
  return { openCount, closeCount };
}

export function registerTextEditorCurrentFoldingActions(app: TTApplication): void {

  // TextEditor.CurrentEditor.Folding:OpenLv2
  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.Folding:OpenLv2',
    Description: 'Level1,2の見出しを展開し、Level3以上の見出しを折り畳む',
    Completion: (item) => {
      try {
        const ctx = getFoldingContext(item);
        if (!ctx) return;
        moveOutOfClosingScopeTo(ctx, 3);
        const { openCount, closeCount } = setFoldStateByLevel(ctx.editor, ctx.headings, 3);
        item.Result = `Lv2まで展開（開${openCount}/閉${closeCount}）`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // TextEditor.CurrentEditor.Folding:OpenLv1
  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.Folding:OpenLv1',
    Description: 'Level1の見出しを展開し、Level2以上の見出しを折り畳む',
    Completion: (item) => {
      try {
        const ctx = getFoldingContext(item);
        if (!ctx) return;
        moveOutOfClosingScopeTo(ctx, 2);
        const { openCount, closeCount } = setFoldStateByLevel(ctx.editor, ctx.headings, 2);
        item.Result = `Lv1まで展開（開${openCount}/閉${closeCount}）`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // TextEditor.CurrentEditor.Folding:OpenAll
  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.Folding:OpenAll',
    Description: 'すべての見出しを展開する',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        editor.trigger('tt', 'editor.unfoldAll', {});
        item.Result = 'すべて展開';
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // TextEditor.CurrentEditor.Folding:CloseAll
  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.Folding:CloseAll',
    Description: 'カーソルを最上位の親見出し行へ移動し、すべての見出しを折り畳む',
    Completion: (item) => {
      try {
        const ctx = getFoldingContext(item);
        if (!ctx) return;
        const { editor, headings, targetOffset } = ctx;
        const top = findAncestorAtOrAboveLevel(headings, targetOffset, 1);
        if (top) {
          editor.setPosition({ lineNumber: top.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(top.line);
        }
        editor.trigger('tt', 'editor.foldAll', {});
        item.Result = 'すべて折畳';
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });
}
