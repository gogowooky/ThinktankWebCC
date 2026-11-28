/**
 * linkTagActions.ts
 * カーソル位置の URL・パスと Linkタグを相互に置き換えるアクション（:ToTag / :FromTag）。
 *
 * registerTextEditorCursorContentActions（textEditorCursorContentActions.ts）から順に呼ばれる。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { getErrorMessage } from '../../utils/errorMessage';
import { baseNameOf, captionOfLinkFile, isLocalPathTarget, parseLinkTag } from '../../utils/linkFormat';
import { findTextRangeOnCursor } from '../../utils/textOnCursor';
import { cursorContentHelpers } from './cursorContentHelpers';

export function registerLinkTagActions(app: TTApplication): void {
  const { linkTagForSource, linkFileOnCursor } = cursorContentHelpers(app);

  // ── URL/パス ⇔ Linkタグ ─────────────────────────────────────────────────
  /** カーソル位置の URL・パス・タグとその範囲（エディタに渡せる IRange） */
  const targetOnCursor = () => {
    const editor = TTShortcutManager.instance.activeEditor;
    const pos = editor?.getPosition?.();
    const model = editor?.getModel?.();
    if (!pos || !model) return null;
    const line: string = model.getLineContent(pos.lineNumber);
    const found = findTextRangeOnCursor(line, pos.column);
    if (!found) return null;
    return {
      editor,
      line,
      text: found.text,
      lineNumber: pos.lineNumber as number,
      startColumn: found.startColumn,
      endColumn: found.endColumn,
    };
  };

  const replaceOnCursor = (
    target: NonNullable<ReturnType<typeof targetOnCursor>>, endColumn: number, text: string, source: string,
  ) => {
    const range = { startLineNumber: target.lineNumber, startColumn: target.startColumn, endLineNumber: target.lineNumber, endColumn };
    target.editor.executeEdits(source, [{ range, text, forceMoveMarkers: true }]);
    target.editor.setPosition({ lineNumber: target.lineNumber, column: target.startColumn + text.length });
    target.editor.focus();
  };

  const urlTitle = (url: string): string => {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').filter(Boolean).pop();
      return last ? decodeURIComponent(last) : u.hostname;
    } catch {
      return url;
    }
  };

  /** file:// のURIは linkファイルに書くパスへ直す */
  const fileUriToPath = (target: string): string => {
    if (!/^file:\/\//i.test(target)) return target;
    try {
      return decodeURIComponent(new URL(target).pathname).replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\');
    } catch {
      return target;
    }
  };

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Url:ToTag',
    Description: 'カーソル位置のURLの linkファイルを用意し（同じリンク先があれば再利用）、URLを参照タグに置き換える',
    Completion: async (item) => {
      try {
        const target = targetOnCursor();
        if (!target || !/^https?:\/\//i.test(target.text)) { item.Result = 'カーソル位置のテキストがURLではありません'; return; }
        const tag = await linkTagForSource({ target: target.text, title: urlTitle(target.text) });
        replaceOnCursor(target, target.endColumn, tag, 'url-to-tag');
        item.Result = `タグ化: ${tag}`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:File:ToTag',
    Description: 'カーソル位置のファイルパスの linkファイルを用意し（同じリンク先があれば再利用）、パスを参照タグに置き換える',
    Completion: async (item) => {
      try {
        const target = targetOnCursor();
        const path = target ? fileUriToPath(target.text) : '';
        if (!target || /^https?:\/\//i.test(path) || (path.startsWith('[') && path.endsWith(']')) || !isLocalPathTarget(path)) {
          item.Result = 'カーソル位置のテキストがファイルパスではありません';
          return;
        }
        // フォルダかどうかは PC版なら実際に確かめる（[file:ID] / [dir:ID] の区別に使う）
        const stat = await window.electronAPI?.system?.isDirectory?.(path).catch(() => null);
        const isDirectory = stat && stat.ok ? stat.isDirectory : undefined;
        const tag = await linkTagForSource({
          target: path,
          title: baseNameOf(path),
          ...(isDirectory !== undefined ? { isDirectory } : {}),
        });
        replaceOnCursor(target, target.endColumn, tag, 'file-to-tag');
        item.Result = `タグ化: ${tag}`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Link:FromTag',
    Description: 'カーソル位置のLinkタグを、linkファイルのリンク先（URL、または引用符で囲んだパス）に置き換える',
    Completion: async (item) => {
      try {
        const target = targetOnCursor();
        const tag = target ? parseLinkTag(target.text) : null;
        if (!target || !tag) { item.Result = 'カーソル位置のテキストがLinkタグではありません'; return; }
        const resolved = await linkFileOnCursor();
        if (typeof resolved === 'string') { item.Result = resolved; return; }
        const link = resolved.file.link;
        const replacement = isLocalPathTarget(link) ? `"${link.replace(/"/g, '""')}"` : link;
        // タグ作成時に添えた「 Caption」が直後に残っていれば、それも一緒に置き換える
        const caption = ` ${captionOfLinkFile(resolved.file)}`;
        const after = target.line.slice(target.endColumn - 1);
        const endColumn = caption.trim() && after.startsWith(caption) ? target.endColumn + caption.length : target.endColumn;
        replaceOnCursor(target, endColumn, replacement, 'link-from-tag');
        item.Result = `リンク先に置換: ${replacement}`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });
}
