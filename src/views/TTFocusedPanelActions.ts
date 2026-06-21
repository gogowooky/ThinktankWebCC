/**
 * TTFocusedPanelActions.ts
 * FocusedPanel 系 TTAction の登録。
 *
 * app.FocusedColumn が示すパネルに対して
 * ToggleAreaVisibility / SetViewModePrev / SetViewModeNext を実行する。
 *
 * 呼び出し: App.tsx の初期化フローで registerFocusedPanelActions(app) を呼ぶ。
 */

import type { TTApplication } from './TTApplication';
import { TTActions } from './TTActions';
import { TTShortcutManager } from './TTShortcutManager';
import { TTUIStateManager } from './TTUIStateManager';
import { collectAreaIds } from './TTWorkoutPanel';

// ── パネルごとの ViewMode 順序定義 ───────────────────────────────────────────

const PANEL_VIEW_MODES: Record<string, string[]> = {
  Thinktank:      ['filter', 'chat', 'settings'],
  Overview:       ['datagrid', 'graph', 'chat', 'settings'],
  WorkoutSetting: ['workout', 'texteditor', 'markdown', 'datagrid', 'card', 'graph'],
  Workout:        ['workout', 'texteditor', 'markdown', 'datagrid', 'card', 'graph'],
  ReThink:        ['chat', 'settings'],
};

// ── 共通ヘルパー ─────────────────────────────────────────────────────────────

type PanelLike = {
  ToggleArea():            void;
  IsAreaOpen:              boolean;
  ViewMode:                string;
  SetViewMode(mode: any):  void;
};

function getPanel(app: TTApplication): PanelLike | null {
  switch (app.FocusedColumn) {
    case 'Thinktank':      return app.ThinktankPanel;
    case 'Overview':       return app.OverviewPanel;
    case 'WorkoutSetting':
    case 'Workout':        return app.WorkoutPanel;
    case 'ReThink':        return app.ReThinkPanel;
    default:               return null;
  }
}

// ── 登録 ─────────────────────────────────────────────────────────────────────

export function registerFocusedPanelActions(app: TTApplication): void {

  TTActions.Register({
    ActionID: 'FocusedPanel.Area.IsOpen:Toggle',
    Completion: (item) => {
      const panel = getPanel(app);
      if (!panel) { item.Result = '[対象なし]'; return; }
      panel.ToggleArea();
      item.Result = panel.IsAreaOpen ? '開いた' : '閉じた';
    },
  });

  TTActions.Register({
    ActionID: 'FocusedPanel.Mode.Name:Prev',
    Completion: (item) => {
      const panel = getPanel(app);
      const modes = PANEL_VIEW_MODES[app.FocusedColumn];
      if (!panel || !modes) { item.Result = '[対象なし]'; return; }
      const idx  = modes.indexOf(panel.ViewMode);
      const prev = modes[(idx - 1 + modes.length) % modes.length];
      panel.SetViewMode(prev);
      item.Result = prev;
    },
  });

  TTActions.Register({
    ActionID: 'FocusedPanel.Mode.Name:Next',
    Completion: (item) => {
      const panel = getPanel(app);
      const modes = PANEL_VIEW_MODES[app.FocusedColumn];
      if (!panel || !modes) { item.Result = '[対象なし]'; return; }
      const idx  = modes.indexOf(panel.ViewMode);
      const next = modes[(idx + 1) % modes.length];
      panel.SetViewMode(next);
      item.Result = next;
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.Mode.Name:Next',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('ToolBar.Mode.Name', 'next');
      item.Result = TTUIStateManager.instance.getProperty('ToolBar.Mode.Name');
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.Mode.Name:Prev',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('ToolBar.Mode.Name', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('ToolBar.Mode.Name');
    },
  });

  // ExMode 関連アクションの登録
  TTActions.Register({
    ActionID: 'Application.Status.ExMode:ExApp',
    Completion: (item) => {
      app.Status.SetExMode('ExApp', item.Mods ?? '');
      item.Result = `ExMode→ExApp [${item.Mods ?? ''}]`;
    },
  });
  TTActions.Register({
    ActionID: 'ExMode:ExApp',
    Completion: (item) => {
      app.Status.SetExMode('ExApp', item.Mods ?? '');
      item.Result = `ExMode→ExApp [${item.Mods ?? ''}]`;
    },
  });

  TTActions.Register({
    ActionID: 'Application.Status.ExMode:ExOpt',
    Completion: (item) => {
      app.Status.SetExMode('ExOpt', item.Mods ?? '');
      item.Result = `ExMode→ExOpt [${item.Mods ?? ''}]`;
    },
  });
  TTActions.Register({
    ActionID: 'ExMode:ExOpt',
    Completion: (item) => {
      app.Status.SetExMode('ExOpt', item.Mods ?? '');
      item.Result = `ExMode→ExOpt [${item.Mods ?? ''}]`;
    },
  });

  TTActions.Register({
    ActionID: 'Application.Status.ExMode:None',
    Completion: (item) => {
      app.Status.SetExMode('None', item.Mods ?? '');
      item.Result = `ExMode→None [${item.Mods ?? ''}]`;
    },
  });
  TTActions.Register({
    ActionID: 'ExMode:None',
    Completion: (item) => {
      app.Status.SetExMode('None', item.Mods ?? '');
      item.Result = `ExMode→None [${item.Mods ?? ''}]`;
    },
  });

  // UI状態 (Undo/Redo) アクションの登録
  TTActions.Register({
    ActionID: 'TextEditor.EditText.Undo',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'undo', {});
        item.Result = 'Editor Undo';
      } else {
        TTUIStateManager.instance.undo();
        item.Result = 'UI State Undo';
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.EditText.Redo',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'redo', {});
        item.Result = 'Editor Redo';
      } else {
        TTUIStateManager.instance.redo();
        item.Result = 'UI State Redo';
      }
    },
  });

  // 状態変数 (Property) 変更アクションの登録
  TTActions.Register({
    ActionID: 'Application.FocusedArea.Name:prev',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedArea.Name', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedArea.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedArea.Name:next',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedArea.Name', 'next');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedArea.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedPanel.Name:Prev',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedPanel.Name', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedPanel.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedPanel.Name:Next',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedPanel.Name', 'next');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedPanel.Name');
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.PaneNumber:Next',
    Completion: (item) => {
      const wPanel = app.WorkoutPanel;
      const layout = wPanel.Layout;
      if (!layout) { item.Result = '[レイアウトなし]'; return; }
      const order = collectAreaIds(layout);
      if (order.length <= 1) { item.Result = '[ペイン数不足]'; return; }

      const curIdx = wPanel.FocusedAreaId ? order.indexOf(wPanel.FocusedAreaId) : -1;
      const nextIdx = curIdx >= 0 ? (curIdx + 1) % order.length : 0;
      const nextAreaId = order[nextIdx];

      wPanel.FocusArea(nextAreaId);
      item.Result = `Pane ${nextIdx + 1}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.PaneNumber:Prev',
    Completion: (item) => {
      const wPanel = app.WorkoutPanel;
      const layout = wPanel.Layout;
      if (!layout) { item.Result = '[レイアウトなし]'; return; }
      const order = collectAreaIds(layout);
      if (order.length <= 1) { item.Result = '[ペイン数不足]'; return; }

      const curIdx = wPanel.FocusedAreaId ? order.indexOf(wPanel.FocusedAreaId) : -1;
      const prevIdx = curIdx >= 0 ? (curIdx - 1 + order.length) % order.length : order.length - 1;
      const prevAreaId = order[prevIdx];

      wPanel.FocusArea(prevAreaId);
      item.Result = `Pane ${prevIdx + 1}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.Mode:Next',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('WorkoutPanel.FocusedPane.Mode', 'next');
      item.Result = TTUIStateManager.instance.getProperty('WorkoutPanel.FocusedPane.Mode');
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.Mode:Prev',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('WorkoutPanel.FocusedPane.Mode', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('WorkoutPanel.FocusedPane.Mode');
    },
  });

  // LineNumbers
  TTActions.Register({
    ActionID: 'TextEditor.LineNumbers.IsVisible:Toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.LineNumbers.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.LineNumbers.IsVisible');
    },
  });
  TTActions.Register({
    ActionID: 'TextEditor.LineNumbers.IsVisible:toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.LineNumbers.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.LineNumbers.IsVisible');
    },
  });

  // WordWrap
  TTActions.Register({
    ActionID: 'TextEditor.WordWrap.IsVisible:Toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.WordWrap.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.WordWrap.IsVisible');
    },
  });
  TTActions.Register({
    ActionID: 'TextEditor.WordWrap.IsVisible:toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.WordWrap.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.WordWrap.IsVisible');
    },
  });

  // Minimap
  TTActions.Register({
    ActionID: 'TextEditor.Minimap.IsVisible:Toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.Minimap.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.Minimap.IsVisible');
    },
  });
  TTActions.Register({
    ActionID: 'TextEditor.Minimap.IsVisible:toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.Minimap.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.Minimap.IsVisible');
    },
  });

  // FullWidthSpace
  TTActions.Register({
    ActionID: 'TextEditor.FullWidthSpace.IsVisible:Toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.FullWidthSpace.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.FullWidthSpace.IsVisible');
    },
  });
  TTActions.Register({
    ActionID: 'TextEditor.FullWidthSpace.IsVisible:toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.FullWidthSpace.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.FullWidthSpace.IsVisible');
    },
  });

  // UnicodeHighlight
  TTActions.Register({
    ActionID: 'TextEditor.UnicodeHighlight.IsVisible:Toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.UnicodeHighlight.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.UnicodeHighlight.IsVisible');
    },
  });
  TTActions.Register({
    ActionID: 'TextEditor.UnicodeHighlight.IsVisible:toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.UnicodeHighlight.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.UnicodeHighlight.IsVisible');
    },
  });

  // BracketPairColorization
  TTActions.Register({
    ActionID: 'TextEditor.BracketPairColorization.IsVisible:Toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.BracketPairColorization.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.BracketPairColorization.IsVisible');
    },
  });
  TTActions.Register({
    ActionID: 'TextEditor.BracketPairColorization.IsVisible:toggle',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('TextEditor.BracketPairColorization.IsVisible', 'toggle');
      item.Result = TTUIStateManager.instance.getProperty('TextEditor.BracketPairColorization.IsVisible');
    },
  });

  registerTextEditorActions();
}

// ── テキストエディタ専用のアクション登録 ──────────────────────────────────────────

function getHeadingLevel(lineContent: string): number {
  const match = lineContent.match(/^(\s{0,3})(#{1,6})\s/);
  return match ? match[2].length : 0;
}

function getHeadingScope(model: any, startLine: number, parentLevel: number): { start: number; end: number } {
  const lineCount = model.getLineCount();
  let endLine = lineCount;
  for (let i = startLine + 1; i <= lineCount; i++) {
    const level = getHeadingLevel(model.getLineContent(i));
    if (level > 0 && level <= parentLevel) {
      endLine = i - 1;
      break;
    }
  }
  return { start: startLine, end: endLine };
}

/**
 * 指定行が現在表示されているか（折畳で隠れていないか）を返す。
 *
 * Monaco 内部 API の getEndLineNumber() は未初期化時に undefined を返すため信頼できない。
 * 代わりに、ドキュメントの見出し構造から fold スコープを自前計算し、
 * 動作実績のある isLineFolded() で折畳状態を確認する方式を採用する。
 *
 * アルゴリズム:
 *   lineNumber より前にある全見出し行 h について
 *     - h が折畳まれている
 *     - h の fold スコープ（h+1 〜 同レベル以下の次の見出し行の前行）に lineNumber が含まれる
 *   上記を満たす h が存在すれば lineNumber は隠れている。
 */
function isLineVisible(editor: any, lineNumber: number, model: any): boolean {
  const hiddenAreas = typeof editor.getHiddenAreas === 'function' ? (editor.getHiddenAreas() ?? []) : [];
  return !hiddenAreas.some((r: any) => lineNumber >= r.startLineNumber && lineNumber <= r.endLineNumber);
}

function isLineFolded(editor: any, lineNumber: number): boolean {
  // Monaco 0.52 の同期フィールドは foldingModel（アンダースコアなし）
  const regions = (editor.getContribution?.('editor.contrib.folding') as any)
    ?.foldingModel?.regions;
  if (regions) {
    for (let i = 0; i < regions.length; i++) {
      if (regions.isCollapsed(i) && regions.getStartLineNumber(i) === lineNumber) {
        return true;
      }
    }
    return false;
  }
  // フォールバック: 旧 Monaco 公開 API (0.44 未満)
  if (typeof editor.getHiddenAreas === 'function') {
    const hiddenAreas: any[] = editor.getHiddenAreas() ?? [];
    const nextLine = lineNumber + 1;
    return hiddenAreas.some((r: any) =>
      nextLine >= r.startLineNumber && nextLine <= r.endLineNumber
    );
  }
  return false;
}

export function registerTextEditorActions(): void {

  // 1. TextEditor.CurrentFolding.Heading:VisibleForward
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:VisibleForward',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        const headings = getHeadingAttributes(editor);
        const targetOffset = model.getOffsetAt(pos);

        // offset < targetOffset を満たす見出しを降順（後ろから）走査し、isHidden === false である最初の行を特定
        const target = [...headings].reverse().find(h => h.offset < targetOffset && !h.isHidden);

        if (target) {
          editor.setPosition({ lineNumber: target.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(target.line);
          item.Result = `L${target.line}へ移動`;
        } else {
          item.Result = '表示見出しなし';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  // 2. TextEditor.CurrentFolding.Heading:VisibleBackward
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:VisibleBackward',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        const headings = getHeadingAttributes(editor);
        const targetOffset = model.getOffsetAt(pos);

        // offset > targetOffset を満たす見出しを昇順（前から）走査し、isHidden === false である最初の行を特定
        const target = headings.find(h => h.offset > targetOffset && !h.isHidden);

        if (target) {
          editor.setPosition({ lineNumber: target.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(target.line);
          item.Result = `L${target.line}へ移動`;
        } else {
          item.Result = '表示見出しなし';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  // 3. TextEditor.CurrentFolding.Heading:OpenStepwise
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:OpenStepwise',
    Completion: (item) => {
      item.Result = '削除済み';
    },
  });

  // 4. TextEditor.CurrentFolding.Heading:CloseStepwise
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:CloseStepwise',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        const headings = getHeadingAttributes(editor);
        const targetOffset = model.getOffsetAt(pos);

        // 現在のカーソル位置から上方向に最も近い見出し H を取得
        const matched = headings.filter(h => h.offset <= targetOffset);
        if (matched.length === 0) { item.Result = '[見出し外]'; return; }
        const h = matched[matched.length - 1];

        // 1. 現カーソル位置が Heading 行にない場合：カーソル位置のテキストが属する Heading 行へ移動して終了
        if (pos.lineNumber !== h.line) {
          editor.setPosition({ lineNumber: h.line, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(h.line);
          item.Result = `L${h.line}へ移動`;
          return;
        }

        // 2. Heading 行が Open である場合： Heading 行を Close にする -> 終了
        if (!isLineFolded(editor, h.line)) {
          editor.setPosition({ lineNumber: h.line, column: 1 });
          editor.trigger('keyboard', 'editor.fold', {});
          editor.setPosition(pos);
          item.Result = `L${h.line}折畳`;
          return;
        }

        // 3. 兄弟 Heading 行のすべてを Close にする -> 終了
        const parentNumber = h.headingNumber.split('.').slice(0, -1).join('.');
        const siblings = headings.filter(
          d => d.level === h.level &&
               d.headingNumber.split('.').slice(0, -1).join('.') === parentNumber
        );

        const targets = siblings.filter(s => !isLineFolded(editor, s.line));
        if (targets.length > 0) {
          targets.forEach(t => {
            editor.setPosition({ lineNumber: t.line, column: 1 });
            editor.trigger('keyboard', 'editor.fold', {});
          });
          editor.setPosition(pos);
          item.Result = `兄弟${targets.length}件折畳`;
        } else {
          item.Result = '兄弟すべて折畳済み';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  // 5. TextEditor.CurrentFolding.Heading:SiblingForward
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:SiblingForward',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        const headings = getHeadingAttributes(editor);
        const targetOffset = model.getOffsetAt(pos);

        // 現在のカーソル位置から上方向に最も近い見出し H を取得
        const matched = headings.filter(h => h.offset <= targetOffset);
        if (matched.length === 0) { item.Result = '[見出し外]'; return; }
        const h = matched[matched.length - 1];

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
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  // 6. TextEditor.CurrentFolding.Heading:SiblingBackward
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:SiblingBackward',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        const headings = getHeadingAttributes(editor);
        const targetOffset = model.getOffsetAt(pos);

        // 現在のカーソル位置から上方向に最も近い見出し H を取得
        const matched = headings.filter(h => h.offset <= targetOffset);
        if (matched.length === 0) { item.Result = '[見出し外]'; return; }
        const h = matched[matched.length - 1];

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
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });
}

export interface HeadingAttribute {
  line: number;
  level: number;
  offset: number;
  headingNumber: string;
  isHidden: boolean;
}

/** 見出しのfoldスコープ末尾行（次の同位以上の見出しの直前まで） */
function headingScopeEnd(headings: HeadingAttribute[], idx: number, lineCount: number): number {
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
export function getHeadingAttributes(editor: any): HeadingAttribute[] {
  const model = editor.getModel();
  if (!model) return [];

  const lineCount = model.getLineCount();
  const attributes: HeadingAttribute[] = [];

  // 見出しレベル(1〜6)ごとのカウンター
  const counters = [0, 0, 0, 0, 0, 0];

  // 現在折りたたまれている行を Set にキャッシュして判定を O(1) にする
  const foldedLines = new Set<number>();
  const regions = (editor.getContribution?.('editor.contrib.folding') as any)
    ?.foldingModel?.regions;
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
