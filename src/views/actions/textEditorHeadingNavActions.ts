/**
 * textEditorHeadingNavActions.ts
 * TextEditor.CurrentFolding.Heading:* アクション（見出し単位でのカーソル移動・折畳の
 * 段階的開閉・兄弟見出し間の移動）の登録。
 *
 * 元は views/TTFocusedPanelActions.ts の registerTextEditorActions として実装されていた
 * （日付/バレット/コメント/折畳アクションの呼び出しも兼ねていたが、それらは各々
 * views/actions/ 配下に分離済みのため、ここでは見出しナビゲーションのみを扱う）。
 */
import type { TTApplication } from '../TTApplication';
import type { TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { type HeadingAttribute, isLineFolded, headingScopeEnd, getHeadingAttributes } from '../../utils/markdownHeadings';
import { getErrorMessage } from '../../utils/errorMessage';

/** 見出しナビゲーション系アクション共通の前準備（エディタ/モデル/カーソル位置/見出し一覧の取得）。失敗時は item.Result を設定して null を返す。 */
interface HeadingNavContext {
  editor: any;
  model: any;
  pos: any;
  headings: HeadingAttribute[];
  targetOffset: number;
}

function getHeadingNavContext(item: TTActionItem): HeadingNavContext | null {
  const editor = TTShortcutManager.instance.activeEditor;
  if (!editor) { item.Result = '[エディタ未選択]'; return null; }
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) { item.Result = '[モデル/位置なし]'; return null; }
  const headings = getHeadingAttributes(editor);
  const targetOffset = model.getOffsetAt(pos);
  return { editor, model, pos, headings, targetOffset };
}

/** カーソル位置から上方向に最も近い見出し H を取得する。無ければ item.Result を設定して null を返す。 */
function getCurrentHeading(ctx: HeadingNavContext, item: TTActionItem): HeadingAttribute | null {
  const matched = ctx.headings.filter(h => h.offset <= ctx.targetOffset);
  if (matched.length === 0) { item.Result = '[見出し外]'; return null; }
  return matched[matched.length - 1];
}

export function registerTextEditorHeadingNavActions(app: TTApplication): void {

  // 1. TextEditor.CurrentFolding.Heading:VisibleForward
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:VisibleForward',
    Description: '次の表示中見出し行へ移動する（非表示の見出しは除外）',
    Completion: (item) => {
      try {
        const ctx = getHeadingNavContext(item);
        if (!ctx) return;
        const { editor, headings, targetOffset } = ctx;

        // offset < targetOffset を満たす見出しを降順（後ろから）走査し、isHidden === false である最初の行を特定
        const target = [...headings].reverse().find(h => h.offset < targetOffset && !h.isHidden);

        if (target) {
          editor.setPosition({ lineNumber: target.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(target.line);
          item.Result = `L${target.line}へ移動`;
        } else {
          item.Result = '表示見出しなし';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // 2. TextEditor.CurrentFolding.Heading:VisibleBackward
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:VisibleBackward',
    Description: '前の表示中見出し行へ移動する（非表示の見出しは除外）',
    Completion: (item) => {
      try {
        const ctx = getHeadingNavContext(item);
        if (!ctx) return;
        const { editor, headings, targetOffset } = ctx;

        // offset > targetOffset を満たす見出しを昇順（前から）走査し、isHidden === false である最初の行を特定
        const target = headings.find(h => h.offset > targetOffset && !h.isHidden);

        if (target) {
          editor.setPosition({ lineNumber: target.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(target.line);
          item.Result = `L${target.line}へ移動`;
        } else {
          item.Result = '表示見出しなし';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // 3. TextEditor.CurrentFolding.Heading:OpenStepwise
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:OpenStepwise',
    Description: '見出し行を段階的に開く（Close→Open、Open→子をOpen）',
    Completion: (item) => {
      try {
        const ctx = getHeadingNavContext(item);
        if (!ctx) return;
        const { editor, model, headings } = ctx;
        const h = getCurrentHeading(ctx, item);
        if (!h) return;

        // ↓ 現カーソルがあるHeading行がCloseである場合は、Heading行をOpenにして終了します。
        if (isLineFolded(editor, h.line)) {
          editor.trigger('tt', 'editor.unfold', { selectionLines: [h.line - 1] });
          item.Result = `L${h.line}展開`;
          return;
        }

        // ↓ 現カーソルがあるHeading行がOpenである場合、子Heading行をすべて抽出し、自Heading行や孫Heading行が含まれないことを確認し、抽出した子HeadingのすべてをOpenにして終了します
        const scopeEnd = headingScopeEnd(headings, headings.indexOf(h), model.getLineCount());
        const childHeadings = headings.filter(
          d => d.line > h.line &&
               d.line <= scopeEnd &&
               d.level === h.level + 1 &&
               d.headingNumber.startsWith(h.headingNumber + '.')
        );

        // 自Heading行や孫Heading行が含まれないことを確認
        const hasSelfOrGrandchild = childHeadings.some(
          c => c.line === h.line || c.level !== h.level + 1 || !c.headingNumber.startsWith(h.headingNumber + '.')
        );
        if (hasSelfOrGrandchild) {
          console.warn('[Assertion Failed] 子Headingリストに自Headingまたは孫Headingが含まれています。');
        }

        const targets = childHeadings.filter(c => isLineFolded(editor, c.line));
        if (targets.length > 0) {
          editor.trigger('tt', 'editor.unfold', { selectionLines: targets.map(t => t.line - 1) });
          item.Result = `子${targets.length}件展開`;
        } else {
          item.Result = '子すべて展開済み';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // 4. TextEditor.CurrentFolding.Heading:CloseStepwise
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:CloseStepwise',
    Description: '見出し行を段階的に閉じる（Open→Close、Close→兄弟をClose）',
    Completion: (item) => {
      try {
        const ctx = getHeadingNavContext(item);
        if (!ctx) return;
        const { editor, pos, headings } = ctx;
        const h = getCurrentHeading(ctx, item);
        if (!h) return;

        // ↓ 現カーソル位置がHeading行にない場合は、カーソル位置のテキストが属するHeading行へ移動
        if (pos.lineNumber !== h.line) {
          editor.setPosition({ lineNumber: h.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(h.line);
        }

        // ↓ 現カーソルがあるHeading行がOpenである場合は、Heading行をCloseにして終了します
        if (!isLineFolded(editor, h.line)) {
          editor.trigger('tt', 'editor.fold', { selectionLines: [h.line - 1] });
          item.Result = `L${h.line}折畳`;
          return;
        }

        // ↓ 現カーソルがあるHeading行がCloseである場合は、兄弟Heading行をすべて抽出し、親Heading行や孫Heading行が含まれないことを確認し、抽出した兄弟HeadingのすべてをCloseにして終了します
        const parentNumber = h.headingNumber.split('.').slice(0, -1).join('.');
        const siblings = headings.filter(
          d => d.line !== h.line &&
               d.level === h.level &&
               d.headingNumber.split('.').slice(0, -1).join('.') === parentNumber
        );

        // 親Heading行や孫Heading行が含まれないことを確認
        const hasParentOrGrandchild = siblings.some(
          s => s.level !== h.level || s.headingNumber.split('.').slice(0, -1).join('.') !== parentNumber
        );
        if (hasParentOrGrandchild) {
          console.warn('[Assertion Failed] 兄弟Headingリストに親または孫Headingが含まれています。');
        }

        const targets = siblings.filter(s => !isLineFolded(editor, s.line));
        if (targets.length > 0) {
          editor.trigger('tt', 'editor.fold', { selectionLines: targets.map(t => t.line - 1) });
          item.Result = `兄弟${targets.length}件折畳`;
        } else {
          item.Result = '兄弟すべて折畳済み';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // 5. TextEditor.CurrentFolding.Heading:SiblingForward
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:SiblingForward',
    Description: '次の兄弟見出し行へ移動する',
    Completion: (item) => {
      try {
        const ctx = getHeadingNavContext(item);
        if (!ctx) return;
        const { editor, pos, headings } = ctx;
        const h = getCurrentHeading(ctx, item);
        if (!h) return;

        // 現カーソル位置が Heading 行にない場合：カーソル位置のテキストが属する Heading 行へ移動
        if (pos.lineNumber !== h.line) {
          editor.setPosition({ lineNumber: h.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(h.line);
          item.Result = `L${h.line}へ移動`;
          return;
        }

        // 現カーソル位置が Heading 行である場合：次の兄弟 Heading 行へ移動
        const parentNumber = h.headingNumber.split('.').slice(0, -1).join('.');
        const nextSibling = headings.find(
          d => d.offset > h.offset &&
               d.level === h.level &&
               d.headingNumber.split('.').slice(0, -1).join('.') === parentNumber &&
               !d.isHidden
        );

        if (nextSibling) {
          editor.setPosition({ lineNumber: nextSibling.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(nextSibling.line);
          item.Result = `L${nextSibling.line}へ移動`;
        } else {
          item.Result = '次の兄弟見出しなし';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // 6. TextEditor.CurrentFolding.Heading:SiblingBackward
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:SiblingBackward',
    Description: '前の兄弟見出し行へ移動する',
    Completion: (item) => {
      try {
        const ctx = getHeadingNavContext(item);
        if (!ctx) return;
        const { editor, pos, headings } = ctx;
        const h = getCurrentHeading(ctx, item);
        if (!h) return;

        // 現カーソル位置が Heading 行にない場合：カーソル位置のテキストが属する Heading 行へ移動
        if (pos.lineNumber !== h.line) {
          editor.setPosition({ lineNumber: h.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(h.line);
          item.Result = `L${h.line}へ移動`;
          return;
        }

        // 現カーソル位置が Heading 行である場合：前の兄弟 Heading 行へ移動
        const parentNumber = h.headingNumber.split('.').slice(0, -1).join('.');
        const prevSibling = [...headings].reverse().find(
          d => d.offset < h.offset &&
               d.level === h.level &&
               d.headingNumber.split('.').slice(0, -1).join('.') === parentNumber &&
               !d.isHidden
        );

        if (prevSibling) {
          editor.setPosition({ lineNumber: prevSibling.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(prevSibling.line);
          item.Result = `L${prevSibling.line}へ移動`;
        } else {
          item.Result = '前の兄弟見出しなし';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // 7. TextEditor.CurrentFolding.Heading:SiblingFirst
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:SiblingFirst',
    Description: '最初の兄弟見出し行へ移動する',
    Completion: (item) => {
      try {
        const ctx = getHeadingNavContext(item);
        if (!ctx) return;
        const { editor, headings } = ctx;
        const h = getCurrentHeading(ctx, item);
        if (!h) return;

        const parentNumber = h.headingNumber.split('.').slice(0, -1).join('.');
        // 兄弟Heading（非表示でないもの）を取得
        const siblings = headings.filter(
          d => d.level === h.level &&
               d.headingNumber.split('.').slice(0, -1).join('.') === parentNumber &&
               !d.isHidden
        );

        if (siblings.length === 0) { item.Result = '兄弟見出しなし'; return; }

        const firstSibling = siblings[0];
        if (h.line === firstSibling.line) {
          // 親Heading行へ移動
          const parentHeading = headings.find(d => d.headingNumber === parentNumber);
          if (parentHeading) {
            editor.setPosition({ lineNumber: parentHeading.line, column: 1 });
            editor.revealLineInCenterIfOutsideViewport(parentHeading.line);
            item.Result = `L${parentHeading.line}へ移動`;
          } else {
            item.Result = '親見出しなし';
          }
        } else {
          // 1番目の兄弟Heading行に移動
          editor.setPosition({ lineNumber: firstSibling.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(firstSibling.line);
          item.Result = `L${firstSibling.line}へ移動`;
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // 8. TextEditor.CurrentFolding.Heading:SiblingLast
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:SiblingLast',
    Description: '最後の兄弟見出し行へ移動する',
    Completion: (item) => {
      try {
        const ctx = getHeadingNavContext(item);
        if (!ctx) return;
        const { editor, headings } = ctx;
        const h = getCurrentHeading(ctx, item);
        if (!h) return;

        const parentNumber = h.headingNumber.split('.').slice(0, -1).join('.');
        // 兄弟Heading（非表示でないもの）を取得
        const siblings = headings.filter(
          d => d.level === h.level &&
               d.headingNumber.split('.').slice(0, -1).join('.') === parentNumber &&
               !d.isHidden
        );

        if (siblings.length === 0) { item.Result = '兄弟見出しなし'; return; }

        const lastSibling = siblings[siblings.length - 1];
        if (h.line === lastSibling.line) {
          // 親Headingの次の兄弟Heading行へ移動
          const parentHeading = headings.find(d => d.headingNumber === parentNumber);
          if (parentHeading) {
            const grandparentNumber = parentHeading.headingNumber.split('.').slice(0, -1).join('.');
            const parentSiblings = headings.filter(
              d => d.level === parentHeading.level &&
                   d.headingNumber.split('.').slice(0, -1).join('.') === grandparentNumber &&
                   !d.isHidden
            );
            const parentIdx = parentSiblings.findIndex(d => d.line === parentHeading.line);
            if (parentIdx !== -1 && parentIdx < parentSiblings.length - 1) {
              const nextParentSibling = parentSiblings[parentIdx + 1];
              editor.setPosition({ lineNumber: nextParentSibling.line, column: 1 });
              editor.revealLineInCenterIfOutsideViewport(nextParentSibling.line);
              item.Result = `L${nextParentSibling.line}へ移動`;
            } else {
              item.Result = '親の次の兄弟見出しなし';
            }
          } else {
            item.Result = '親見出しなし';
          }
        } else {
          // 最後の兄弟Heading行に移動
          editor.setPosition({ lineNumber: lastSibling.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(lastSibling.line);
          item.Result = `L${lastSibling.line}へ移動`;
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });
}
