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
import type { ActionID } from './TTAction';
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

  // Dates
  TTActions.Register({
    ActionID: 'Application.Date:Next',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.Date', 'next');
      item.Result = TTUIStateManager.instance.getProperty('Application.Date');
    },
  });
  TTActions.Register({
    ActionID: 'Application.Date:Prev',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.Date', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('Application.Date');
    },
  });

  TTActions.Register({
    ActionID: 'Application.Resource.ExportToLocal',
    Completion: (item) => {
      const status = app.Status as any;
      if (status && typeof status.SetLocalExporting === 'function') {
        status.SetLocalExporting('0%');
      }

      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/bq/files/export/status');
          if (res.ok) {
            const progress = await res.json() as { running: boolean; total: number; current: number };
            if (progress.total > 0 && status && typeof status.SetLocalExporting === 'function') {
              const pct = Math.round((progress.current / progress.total) * 100);
              status.SetLocalExporting(`${pct}%`);
            }
          }
        } catch (e) {
          console.error('Failed to poll export status:', e);
        }
      }, 300);

      return fetch('/api/bq/files/export', { method: 'POST' })
        .then(async (res) => {
          clearInterval(pollInterval);
          if (!res.ok) {
            throw new Error(`Export API failed: ${res.status}`);
          }
          const result = await res.json() as { success: boolean; count: number; path: string };
          if (status && typeof status.SetLocalExporting === 'function') {
            status.SetLocalExporting('100%');
          }
          item.Result = `保存完了: ${result.count}件を ${result.path} に保存しました`;
        })
        .catch((err) => {
          clearInterval(pollInterval);
          if (status && typeof status.SetLocalExporting === 'function') {
            status.SetLocalExporting('0%');
          }
          item.Result = `[エラー] ${err.message}`;
          throw err;
        });
    },
  });

  registerTextEditorCursorPosActions(app);
  registerTextEditorActions(app);
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

export function registerTextEditorActions(app: TTApplication): void {

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
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
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

  // 7. TextEditor.CurrentFolding.Heading:SiblingFirst
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:SiblingFirst',
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
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  // 8. TextEditor.CurrentFolding.Heading:SiblingLast
  TTActions.Register({
    ActionID: 'TextEditor.CurrentFolding.Heading:SiblingLast',
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
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  registerTextEditorDateActions(app);
  registerTextEditorBulletActions(app);
  registerTextEditorCommentActions(app);
  registerTextEditorFoldingHeadingActions(app);
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

// ── 日付操作 (TextEditor.EditDate) 関連の実装 ───────────────────────────────

export interface DateEditState {
  originalText: string;
  originalStartOffset: number;
  originalLength: number;
  currentDate: Date;
  baseFormat: 'DateTag' | 'Date' | 'JDate' | 'GDate';
  weekTimeSuffix: '' | 'W' | 'T' | 'WT';
}

let activeDateEditState: DateEditState | null = null;

function getJapaneseEra(date: Date): { era: string; year: number } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dateVal = y * 10000 + m * 100 + d;
  
  if (dateVal >= 20190501) {
    return { era: '令和', year: y - 2019 + 1 };
  } else if (dateVal >= 19890108) {
    return { era: '平成', year: y - 1989 + 1 };
  } else if (dateVal >= 19261225) {
    return { era: '昭和', year: y - 1926 + 1 };
  } else if (dateVal >= 19120730) {
    return { era: '大正', year: y - 1912 + 1 };
  } else {
    return { era: '明治', year: y - 1868 + 1 };
  }
}

function formatDate(date: Date, formatKey: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ddd = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];

  if (formatKey.startsWith('GDate')) {
    const eraInfo = getJapaneseEra(date);
    const ggyy = eraInfo.era + pad(eraInfo.year);
    switch (formatKey) {
      case 'GDate': return `${ggyy}年${MM}月${dd}日`;
      case 'GDateW': return `${ggyy}年${MM}月${dd}日 (${ddd})`;
      case 'GDateT': return `${ggyy}年${MM}月${dd}日 ${HH}時${mm}分`;
      case 'GDateWT': return `${ggyy}年${MM}月${dd}日 (${ddd}) ${HH}時${mm}分`;
      default: return `${ggyy}年${MM}月${dd}日`;
    }
  }

  switch (formatKey) {
    case 'DateTag': return `[${yyyy}-${MM}-${dd}]`;
    case 'Date': return `${yyyy}/${MM}/${dd}`;
    case 'DateW': return `${yyyy}/${MM}/${dd} (${ddd})`;
    case 'DateT': return `${yyyy}/${MM}/${dd} ${HH}:${mm}`;
    case 'DateWT': return `${yyyy}/${MM}/${dd} (${ddd}) ${HH}:${mm}`;
    case 'JDate': return `${yyyy}年${MM}月${dd}日`;
    case 'JDateW': return `${yyyy}年${MM}月${dd}日 (${ddd})`;
    case 'JDateT': return `${yyyy}年${MM}月${dd}日 ${HH}:${mm}`;
    case 'JDateWT': return `${yyyy}年${MM}月${dd}日 (${ddd}) ${HH}:${mm}`;
    default: return `${yyyy}/${MM}/${dd}`;
  }
}

function parseDateString(str: string, key: string): Date | null {
  try {
    if (key === 'DateTag') {
      const clean = str.replace(/[\[\]]/g, '');
      const parts = clean.split('-');
      if (parts.length === 3) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    } else if (key === 'Date') {
      const clean = str.replace(/\s\([日月火水木金土]\)/, '');
      const parts = clean.split(/\s+/);
      const dateParts = parts[0].split('/');
      let hour = 0, minute = 0;
      if (parts[1] && parts[1].includes(':')) {
        const timeParts = parts[1].split(':');
        hour = Number(timeParts[0]);
        minute = Number(timeParts[1]);
      }
      return new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]), hour, minute);
    } else if (key === 'JDate') {
      const clean = str.replace(/\s\([日月火水木金土]\)/, '');
      const parts = clean.split(/\s+/);
      const dateMatch = parts[0].match(/(\d+)年(\d+)月(\d+)日/);
      if (!dateMatch) return null;
      let hour = 0, minute = 0;
      if (parts[1] && parts[1].includes(':')) {
        const timeParts = parts[1].split(':');
        hour = Number(timeParts[0]);
        minute = Number(timeParts[1]);
      }
      return new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hour, minute);
    } else if (key === 'GDate') {
      const clean = str.replace(/\s\([日月火水木金土]\)/, '');
      const parts = clean.split(/\s+/);
      const dateMatch = parts[0].match(/^(明治|大正|昭和|平成|令和)(元|\d+)年(\d+)月(\d+)日/);
      if (!dateMatch) return null;
      
      const era = dateMatch[1];
      const eraYearStr = dateMatch[2];
      const month = Number(dateMatch[3]);
      const day = Number(dateMatch[4]);
      
      const eraYear = eraYearStr === '元' ? 1 : Number(eraYearStr);
      let year = 0;
      if (era === '令和') year = 2019 + eraYear - 1;
      else if (era === '平成') year = 1989 + eraYear - 1;
      else if (era === '昭和') year = 1926 + eraYear - 1;
      else if (era === '大正') year = 1912 + eraYear - 1;
      else if (era === '明治') year = 1868 + eraYear - 1;
      
      let hour = 0, minute = 0;
      if (parts[1]) {
        const timeMatch = parts[1].match(/(\d+)時(\d+)分/);
        if (timeMatch) {
          hour = Number(timeMatch[1]);
          minute = Number(timeMatch[2]);
        }
      }
      return new Date(year, month - 1, day, hour, minute);
    }
  } catch (e) {
    console.error('Error parsing date string:', str, e);
  }
  return null;
}

export interface DateMatch {
  key: 'DateTag' | 'Date' | 'JDate' | 'GDate';
  value: string;
  startColumn: number;
  endColumn: number;
  lineNumber: number;
  date: Date;
  hasWeek: boolean;
  hasTime: boolean;
}

function findDateAtCaret(editor: any): DateMatch | null {
  const model = editor.getModel();
  if (!model) return null;
  const position = editor.getPosition();
  if (!position) return null;

  const lineNumber = position.lineNumber;
  const lineContent = model.getLineContent(lineNumber);
  const caretColumn = position.column;

  const regexes = [
    { key: 'DateTag' as const, regex: /\[\d{4}-\d{2}-\d{2}\]/g },
    { key: 'Date' as const, regex: /\d{4}\/\d{1,2}\/\d{1,2}(?:\s\([日月火水木金土]\))?(?:\s\d{2}:\d{2})?/g },
    { key: 'JDate' as const, regex: /\d{4}年\d{1,2}月\d{1,2}日(?:\s\([日月火水木金土]\))?(?:\s\d{2}:\d{2})?/g },
    { key: 'GDate' as const, regex: /(?:明治|大正|昭和|平成|令和)(?:\d{1,2}|元)年\d{1,2}月\d{1,2}日(?:\s\([日月火水木金土]\))?(?:\s\d{2}時\d{2}分)?/g }
  ];

  for (const item of regexes) {
    let match;
    item.regex.lastIndex = 0;
    while ((match = item.regex.exec(lineContent)) !== null) {
      const matchText = match[0];
      const startIdx = match.index;
      const endIdx = startIdx + matchText.length;
      const startColumn = startIdx + 1;
      const endColumn = endIdx + 1;

      if (caretColumn >= startColumn && caretColumn <= endColumn) {
        const parsedDate = parseDateString(matchText, item.key);
        if (parsedDate) {
          const hasWeek = matchText.includes('(');
          const hasTime = matchText.includes(':') || matchText.includes('時');
          return {
            key: item.key,
            value: matchText,
            startColumn,
            endColumn,
            lineNumber,
            date: parsedDate,
            hasWeek,
            hasTime
          };
        }
      }
    }
  }

  return null;
}

export function registerTextEditorDateActions(app: TTApplication): void {
  // 1. TextEditor.EditDate.InsertExDate
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.InsertExDate',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        if (!model) { item.Result = '[モデルなし]'; return; }

        const match = findDateAtCaret(editor);
        if (match) {
          activeDateEditState = {
            originalText: match.value,
            originalStartOffset: model.getOffsetAt({ lineNumber: match.lineNumber, column: match.startColumn }),
            originalLength: match.value.length,
            currentDate: match.date,
            baseFormat: match.key,
            weekTimeSuffix: ((match.hasWeek ? 'W' : '') + (match.hasTime ? 'T' : '')) as any
          };
          // カーソルを先頭に移動
          editor.setPosition({ lineNumber: match.lineNumber, column: match.startColumn });
          app.Status.SetExMode('ExDate', item.Mods ?? '');
          item.Result = `ExDateモード開始: ${match.value}`;
        } else {
          // 新規挿入
          const now = new Date();
          const initialText = formatDate(now, 'JDateW');
          const pos = editor.getPosition();
          if (!pos) { item.Result = '[位置なし]'; return; }

          const range = new (window as any).monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
          editor.executeEdits("insertExDate", [{
            range: range,
            text: initialText,
            forceMoveMarkers: false
          }]);

          editor.setPosition(pos); // 挿入テキストの先頭に
          activeDateEditState = {
            originalText: initialText,
            originalStartOffset: model.getOffsetAt(pos),
            originalLength: initialText.length,
            currentDate: now,
            baseFormat: 'JDate',
            weekTimeSuffix: 'W'
          };
          app.Status.SetExMode('ExDate', item.Mods ?? '');
          item.Result = `ExDate新規挿入: ${initialText}`;
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  // 共通処理ヘルパー
  const modifyDate = (item: any, updateFn: (state: DateEditState) => void) => {
    try {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) { item.Result = '[エディタ未選択]'; return; }
      if (!activeDateEditState) { item.Result = '[日付状態なし]'; return; }

      const match = findDateAtCaret(editor);
      if (!match) { item.Result = '[日付未検出]'; return; }

      updateFn(activeDateEditState);

      const formatKey = activeDateEditState.baseFormat === 'DateTag' ? 'DateTag' : (activeDateEditState.baseFormat + activeDateEditState.weekTimeSuffix);
      const newText = formatDate(activeDateEditState.currentDate, formatKey);

      const range = new (window as any).monaco.Range(match.lineNumber, match.startColumn, match.lineNumber, match.endColumn);
      editor.executeEdits("changeDate", [{
        range: range,
        text: newText,
        forceMoveMarkers: false
      }]);

      editor.setPosition({ lineNumber: match.lineNumber, column: match.startColumn });
      item.Result = newText;
    } catch (err: any) {
      item.Result = `[エラー] ${err.message}`;
    }
  };

  // 2. ChangeFormat
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.ChangeFormat',
    Completion: (item) => {
      modifyDate(item, (state) => {
        const baseFormats: ('DateTag' | 'Date' | 'JDate' | 'GDate')[] = ['DateTag', 'Date', 'JDate', 'GDate'];
        const isShift = (item.Mods ?? '').toLowerCase().includes('shift');
        const idx = baseFormats.indexOf(state.baseFormat);
        const nextIdx = isShift
          ? (idx - 1 + baseFormats.length) % baseFormats.length
          : (idx + 1) % baseFormats.length;
        state.baseFormat = baseFormats[nextIdx];
      });
    }
  });

  // 3. ToggleWeekday
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.ToggleWeekday',
    Completion: (item) => {
      modifyDate(item, (state) => {
        if (state.baseFormat === 'DateTag') {
          state.baseFormat = 'Date';
          state.weekTimeSuffix = 'W';
          return;
        }
        if (state.weekTimeSuffix.includes('W')) {
          state.weekTimeSuffix = state.weekTimeSuffix.replace('W', '') as any;
        } else {
          state.weekTimeSuffix = state.weekTimeSuffix.includes('T') ? 'WT' : 'W';
        }
      });
    }
  });

  // 4. ToggleTime
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.ToggleTime',
    Completion: (item) => {
      modifyDate(item, (state) => {
        if (state.baseFormat === 'DateTag') {
          state.baseFormat = 'Date';
          state.weekTimeSuffix = 'T';
          return;
        }
        if (state.weekTimeSuffix.includes('T')) {
          state.weekTimeSuffix = state.weekTimeSuffix.replace('T', '') as any;
        } else {
          state.weekTimeSuffix = state.weekTimeSuffix.includes('W') ? 'WT' : 'T';
        }
      });
    }
  });

  // 5. IncYear
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.IncYear',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate.setFullYear(state.currentDate.getFullYear() + 1);
      });
    }
  });

  // 6. DecYear
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.DecYear',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate.setFullYear(state.currentDate.getFullYear() - 1);
      });
    }
  });

  // 7. IncMonth
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.IncMonth',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
      });
    }
  });

  // 8. DecMonth
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.DecMonth',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
      });
    }
  });

  // 9. IncWeek
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.IncWeek',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate.setDate(state.currentDate.getDate() + 7);
      });
    }
  });

  // 10. DecWeek
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.DecWeek',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate.setDate(state.currentDate.getDate() - 7);
      });
    }
  });

  // 11. IncDay
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.IncDay',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate.setDate(state.currentDate.getDate() + 1);
      });
    }
  });

  // 12. DecDay
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.DecDay',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate.setDate(state.currentDate.getDate() - 1);
      });
    }
  });

  // 13. SetNow
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.SetNow',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate = new Date();
      });
    }
  });

  // 14. Reset
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.Reset',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        if (!activeDateEditState) { item.Result = '[日付状態なし]'; return; }

        const match = findDateAtCaret(editor);
        const model = editor.getModel();

        if (match && model) {
          const range = new (window as any).monaco.Range(match.lineNumber, match.startColumn, match.lineNumber, match.endColumn);
          editor.executeEdits("resetDate", [{
            range: range,
            text: activeDateEditState.originalText,
            forceMoveMarkers: false
          }]);
          editor.setPosition({ lineNumber: match.lineNumber, column: match.startColumn });
        } else if (model) {
          // フォールバック: 開始オフセットから復元
          const startPos = model.getPositionAt(activeDateEditState.originalStartOffset);
          const endPos = model.getPositionAt(activeDateEditState.originalStartOffset + activeDateEditState.originalLength);
          const range = new (window as any).monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
          editor.executeEdits("resetDate", [{
            range: range,
            text: activeDateEditState.originalText,
            forceMoveMarkers: false
          }]);
          editor.setPosition(startPos);
        }
        activeDateEditState = null;
        app.Status.ClearExMode();
        item.Result = '日付リセット/ExDate終了';
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });
}

export function registerTextEditorBulletActions(app: TTApplication): void {
  const getBullets = (app: TTApplication): string[] => {
    const raw = app.WorkoutPanel.TextEditor.Bullet.StyleSet || '';
    const parts = raw.split(',');
    // 末尾のカンマの後ろの空文字列を活かしつつ、余計な空要素を除外します。
    const bullets = parts.filter((b, idx) => b !== '' || idx === parts.length - 1);
    return bullets;
  };

  const toggleBulletStyle = (item: any, direction: 'next' | 'prev') => {
    try {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) { item.Result = '[エディタ未選択]'; return; }
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) { item.Result = '[モデル/選択なし]'; return; }

      const bullets = getBullets(app);
      if (bullets.length === 0) { item.Result = '[バレット設定空]'; return; }

      // 各バレットを文字列の長さ順に降順ソート（ただし空文字列はstartsWithでマッチさせるため除外）
      const sortedBullets = bullets.filter(b => b !== '').sort((a, b) => b.length - a.length);

      const startLine = selection.startLineNumber;
      const endLine = selection.endLineNumber;
      const edits: any[] = [];

      for (let line = startLine; line <= endLine; line++) {
        const lineContent = model.getLineContent(line);
        const matchIndent = lineContent.match(/^([ \t]*)/);
        const indent = matchIndent ? matchIndent[1] : '';
        const content = lineContent.slice(indent.length);

        // バレットリストのいずれかで始まっているか確認
        let matchedBullet: string | null = null;
        for (const b of sortedBullets) {
          if (content.startsWith(b)) {
            matchedBullet = b;
            break;
          }
        }

        let newText = '';
        if (matchedBullet !== null) {
          // すでにバレットがある場合：切り替え
          const originalIdx = bullets.indexOf(matchedBullet);
          const idx = originalIdx >= 0 ? originalIdx : 0;
          let nextIdx = 0;
          if (direction === 'next') {
            nextIdx = (idx + 1) % bullets.length;
          } else {
            nextIdx = (idx - 1 + bullets.length) % bullets.length;
          }
          newText = indent + bullets[nextIdx] + content.slice(matchedBullet.length);
        } else {
          // バレットがない場合（blank状態）：blankのインデックス(空文字列)をベースに遷移
          const blankIdx = bullets.indexOf('');
          const idx = blankIdx >= 0 ? blankIdx : bullets.length - 1;
          let nextIdx = 0;
          if (direction === 'next') {
            nextIdx = (idx + 1) % bullets.length;
          } else {
            nextIdx = (idx - 1 + bullets.length) % bullets.length;
          }
          newText = indent + bullets[nextIdx] + content;
        }

        edits.push({
          range: new (window as any).monaco.Range(line, 1, line, lineContent.length + 1),
          text: newText,
          forceMoveMarkers: false
        });
      }

      if (edits.length > 0) {
        editor.executeEdits("toggleBulletStyle", edits);
        item.Result = `バレット切替 (${direction}): ${startLine}-${endLine}行`;
      }
    } catch (err: any) {
      item.Result = `[エラー] ${err.message}`;
    }
  };

  TTActions.Register({
    ActionID: 'TextEditor.Bullet.NextStyle',
    Completion: (item) => {
      toggleBulletStyle(item, 'next');
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.Bullet.PrevStyle',
    Completion: (item) => {
      toggleBulletStyle(item, 'prev');
    }
  });
}

export function registerTextEditorCommentActions(app: TTApplication): void {
  const getComments = (app: TTApplication): string[] => {
    const raw = app.WorkoutPanel.TextEditor.Comment.StyleSet || '';
    const parts = raw.split(',');
    // 末尾の空文字列を活かしつつ、余計な空要素を除外します。
    const comments = parts.filter((c, idx) => c !== '' || idx === parts.length - 1);
    return comments;
  };

  const toggleCommentStyle = (item: any, direction: 'next' | 'prev') => {
    try {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) { item.Result = '[エディタ未選択]'; return; }
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) { item.Result = '[モデル/選択なし]'; return; }

      const comments = getComments(app);
      if (comments.length === 0) { item.Result = '[コメント設定空]'; return; }

      // 各コメント記号を文字列の長さ順に降順ソート（空文字列は除外）
      const sortedComments = comments.filter(c => c !== '').sort((a, b) => b.length - a.length);

      const startLine = selection.startLineNumber;
      const endLine = selection.endLineNumber;
      const edits: any[] = [];

      for (let line = startLine; line <= endLine; line++) {
        const lineContent = model.getLineContent(line);

        // コメント記号は「先頭の1文字目」から判定するため、インデントなし（行頭から）チェックします
        let matchedComment: string | null = null;
        for (const c of sortedComments) {
          if (lineContent.startsWith(c)) {
            matchedComment = c;
            break;
          }
        }

        let newText = '';
        if (matchedComment !== null) {
          // すでにコメントがある場合：切り替え
          const originalIdx = comments.indexOf(matchedComment);
          const idx = originalIdx >= 0 ? originalIdx : 0;
          let nextIdx = 0;
          if (direction === 'next') {
            nextIdx = (idx + 1) % comments.length;
          } else {
            nextIdx = (idx - 1 + comments.length) % comments.length;
          }
          newText = comments[nextIdx] + lineContent.slice(matchedComment.length);
        } else {
          // コメントがない場合（blank状態）：blankのインデックス(空文字列)をベースに遷移
          const blankIdx = comments.indexOf('');
          const idx = blankIdx >= 0 ? blankIdx : comments.length - 1;
          let nextIdx = 0;
          if (direction === 'next') {
            nextIdx = (idx + 1) % comments.length;
          } else {
            nextIdx = (idx - 1 + comments.length) % comments.length;
          }
          newText = comments[nextIdx] + lineContent;
        }

        edits.push({
          range: new (window as any).monaco.Range(line, 1, line, lineContent.length + 1),
          text: newText,
          forceMoveMarkers: false
        });
      }

      if (edits.length > 0) {
        editor.executeEdits("toggleCommentStyle", edits);
        item.Result = `コメント切替 (${direction}): ${startLine}-${endLine}行`;
      }
    } catch (err: any) {
      item.Result = `[エラー] ${err.message}`;
    }
  };

  TTActions.Register({
    ActionID: 'TextEditor.Comment.NextStyle',
    Completion: (item) => {
      toggleCommentStyle(item, 'next');
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.Comment.PrevStyle',
    Completion: (item) => {
      toggleCommentStyle(item, 'prev');
    }
  });
}

export function registerTextEditorFoldingHeadingActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.FoldingHeading.IncLevel',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection) { item.Result = '[モデル/選択なし]'; return; }

        const startLine = selection.startLineNumber;
        const endLine = selection.endLineNumber;
        const isSelectionEmpty = selection.isEmpty();
        const edits: any[] = [];
        let nextCursorPosition: any = null;

        if (isSelectionEmpty) {
          const pos = editor.getPosition();
          if (!pos) { item.Result = '[位置なし]'; return; }
          const lineContent = model.getLineContent(pos.lineNumber);
          const level = getHeadingLevel(lineContent);
          const isAtLineStart = (pos.column === 1);

          if (isAtLineStart) {
            // カーソル位置がHeading行/非Heading行の先頭の場合は、新しいHeading行を挿入する。
            edits.push({
              range: new (window as any).monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
              text: "# \n",
              forceMoveMarkers: true
            });
            // 挿入された新しい行（# ）の末尾（3文字目）にカーソルを置く
            nextCursorPosition = { lineNumber: pos.lineNumber, column: 3 };
          } else {
            if (level > 0) {
              // カーソル位置がHeading行だが先頭ではない場合は、HeadingのLevelを１つ増やす。
              const match = lineContent.match(/^(\s*)(#+)/);
              if (match) {
                const indent = match[1];
                const hashes = match[2];
                const insertPos = indent.length + hashes.length + 1;
                edits.push({
                  range: new (window as any).monaco.Range(pos.lineNumber, insertPos, pos.lineNumber, insertPos),
                  text: "#",
                  forceMoveMarkers: true
                });
              }
            } else {
              // カーソル位置がHeading行ではない行で先頭ではない場合は、先頭に# を挿入してHeading行とする
              edits.push({
                range: new (window as any).monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
                text: "# ",
                forceMoveMarkers: true
              });
            }
          }
        } else {
          // 選択範囲内のすべての行に対し
          for (let line = startLine; line <= endLine; line++) {
            const lineContent = model.getLineContent(line);
            const level = getHeadingLevel(lineContent);
            if (level > 0) {
              const match = lineContent.match(/^(\s*)(#+)/);
              if (match) {
                const indent = match[1];
                const hashes = match[2];
                const insertPos = indent.length + hashes.length + 1;
                edits.push({
                  range: new (window as any).monaco.Range(line, insertPos, line, insertPos),
                  text: "#",
                  forceMoveMarkers: false
                });
              }
            }
          }
        }

        if (edits.length > 0) {
          editor.executeEdits("IncLevel", edits);
          if (nextCursorPosition) {
            editor.setPosition(nextCursorPosition);
          }
          item.Result = isSelectionEmpty ? `見出しレベルUP (L${startLine})` : `見出しレベルUP: ${startLine}-${endLine}行`;
        } else {
          item.Result = '変更なし';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.FoldingHeading.DecLevel',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection) { item.Result = '[モデル/選択なし]'; return; }

        const startLine = selection.startLineNumber;
        const endLine = selection.endLineNumber;
        const isSelectionEmpty = selection.isEmpty();
        const edits: any[] = [];

        for (let line = startLine; line <= endLine; line++) {
          const lineContent = model.getLineContent(line);
          const level = getHeadingLevel(lineContent);
          if (level > 0) {
            const match = lineContent.match(/^(\s*)(#+)(\s*)/);
            if (match) {
              const indent = match[1];
              const hashes = match[2];
              const spaces = match[3];
              if (level === 1) {
                // # の場合は# とその後ろのスペースを削除する
                const deleteLen = hashes.length + (spaces.length > 0 ? 1 : 0);
                const startCol = indent.length + 1;
                const endCol = startCol + deleteLen;
                edits.push({
                  range: new (window as any).monaco.Range(line, startCol, line, endCol),
                  text: "",
                  forceMoveMarkers: false
                });
              } else {
                // # を1つ減らす
                const startCol = indent.length + hashes.length;
                const endCol = startCol + 1;
                edits.push({
                  range: new (window as any).monaco.Range(line, startCol, line, endCol),
                  text: "",
                  forceMoveMarkers: false
                });
              }
            }
          }
        }

        if (edits.length > 0) {
          editor.executeEdits("DecLevel", edits);
          item.Result = isSelectionEmpty ? `見出しレベルDOWN (L${startLine})` : `見出しレベルDOWN: ${startLine}-${endLine}行`;
        } else {
          item.Result = '変更なし';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });
}

export function registerTextEditorCursorPosActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:LineStart+',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        if (!pos) {
          item.Result = '[位置なし]';
          return;
        }

        const lineNumber = pos.lineNumber;
        const column = pos.column;

        if (column > 1) {
          const newPos = { lineNumber, column: 1 };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = `行先頭（L${lineNumber}:C1）に移動しました`;
        } else if (lineNumber > 1) {
          const newPos = { lineNumber: 1, column: 1 };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = 'テキスト先頭（L1:C1）に移動しました';
        } else {
          const model = editor.getModel();
          if (model) {
            const lastLine = model.getLineCount();
            const lastColumn = model.getLineMaxColumn(lastLine);
            editor.setSelection({
              selectionStartLineNumber: lastLine,
              selectionStartColumn: lastColumn,
              positionLineNumber: 1,
              positionColumn: 1
            });
            item.Result = 'テキストすべてを選択しました';
          }
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:LineEnd+',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (!pos || !model) {
          item.Result = '[モデル/位置なし]';
          return;
        }

        const lineNumber = pos.lineNumber;
        const column = pos.column;
        const lineMaxColumn = model.getLineMaxColumn(lineNumber);
        const totalLines = model.getLineCount();
        const lastLineMaxColumn = model.getLineMaxColumn(totalLines);

        if (column < lineMaxColumn) {
          const newPos = { lineNumber, column: lineMaxColumn };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = `行末尾（L${lineNumber}:C${lineMaxColumn}）に移動しました`;
        } else if (lineNumber < totalLines || column < lastLineMaxColumn) {
          const newPos = { lineNumber: totalLines, column: lastLineMaxColumn };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = `テキスト末尾（L${totalLines}:C${lastLineMaxColumn}）に移動しました`;
        } else {
          editor.setSelection({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: totalLines,
            endColumn: lastLineMaxColumn
          });
          item.Result = 'テキストすべてを選択しました';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:PrevLine',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (!pos || !model) {
          item.Result = '[モデル/位置なし]';
          return;
        }

        const lineNumber = pos.lineNumber;

        if (lineNumber <= 1) {
          const newPos = { lineNumber: 1, column: 1 };
          editor.setPosition(newPos);
          editor.revealLineInCenterIfOutsideViewport(1);
          item.Result = '文書先頭（L1:C1）に移動しました';
        } else {
          // 上の行に向かって、最初に見つかる表示されている（折りたたまれていない）行を探索する
          let targetLine = lineNumber - 1;
          while (targetLine >= 1) {
            if (isLineVisible(editor, targetLine, model)) {
              break;
            }
            targetLine--;
          }

          if (targetLine >= 1) {
            const newPos = { lineNumber: targetLine, column: 1 };
            editor.setPosition(newPos);
            editor.revealLineInCenterIfOutsideViewport(targetLine);
            item.Result = `一つ上の表示されている行の行頭（L${targetLine}:C1）に移動しました`;
          } else {
            // 表示されている上の行が見つからない場合は先頭行へ
            const newPos = { lineNumber: 1, column: 1 };
            editor.setPosition(newPos);
            editor.revealLineInCenterIfOutsideViewport(1);
            item.Result = '文書先頭（L1:C1）に移動しました';
          }
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:NextLine',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (!pos || !model) {
          item.Result = '[モデル/位置なし]';
          return;
        }

        const lineNumber = pos.lineNumber;
        const totalLines = model.getLineCount();

        if (lineNumber >= totalLines) {
          const lastLineMaxColumn = model.getLineMaxColumn(totalLines);
          const newPos = { lineNumber: totalLines, column: lastLineMaxColumn };
          editor.setPosition(newPos);
          editor.revealLineInCenterIfOutsideViewport(totalLines);
          item.Result = `文書末尾（L${totalLines}:C${lastLineMaxColumn}）に移動しました`;
        } else {
          // 下の行に向かって、最初に見つかる表示されている（折りたたまれていない）行を探索する
          let targetLine = lineNumber + 1;
          while (targetLine <= totalLines) {
            if (isLineVisible(editor, targetLine, model)) {
              break;
            }
            targetLine++;
          }

          if (targetLine <= totalLines) {
            const newPos = { lineNumber: targetLine, column: 1 };
            editor.setPosition(newPos);
            editor.revealLineInCenterIfOutsideViewport(targetLine);
            item.Result = `一つ下の表示されている行の行頭（L${targetLine}:C1）に移動しました`;
          } else {
            // 表示されている下の行が見つからない場合は最終行末尾へ
            const lastLineMaxColumn = model.getLineMaxColumn(totalLines);
            const newPos = { lineNumber: totalLines, column: lastLineMaxColumn };
            editor.setPosition(newPos);
            editor.revealLineInCenterIfOutsideViewport(totalLines);
            item.Result = `文書末尾（L${totalLines}:C${lastLineMaxColumn}）に移動しました`;
          }
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  function getCurrentTextOnCursor(): string {
    const editor = TTShortcutManager.instance.activeEditor;
    if (!editor) return '';
    const pos = editor.getPosition();
    const model = editor.getModel();
    if (!pos || !model) return '';

    const lineNumber = pos.lineNumber;
    const column = pos.column;
    const lineContent = model.getLineContent(lineNumber);

    const urlRegex = /https?:\/\/[^\s")]+/g;
    const fileRegex = /([a-zA-Z]:\\|\\\\)[^\s"<>|?*]+/g;
    const tagRegex = /\[([^\]]+)\]/g;

    let textOnCursor = '';
    let match;
    while ((match = urlRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1;
      const endCol = startCol + match[0].length;
      if (column >= startCol && column <= endCol) {
        textOnCursor = match[0];
        break;
      }
    }

    if (!textOnCursor) {
      while ((match = fileRegex.exec(lineContent)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        if (column >= startCol && column <= endCol) {
          textOnCursor = match[0];
          break;
        }
      }
    }

    if (!textOnCursor) {
      while ((match = tagRegex.exec(lineContent)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        if (column >= startCol && column <= endCol) {
          textOnCursor = match[0];
          break;
        }
      }
    }

    return textOnCursor;
  }

  function getTextOnCursorSafe(): string {
    return getCurrentTextOnCursor() || TTUIStateManager.instance.getProperty('TextEditor.CurrentEditor.TextOnCursorPos') || '';
  }

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Url:Open',
    Description: 'ブラウザで対象のURLを開きます',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text || !(text.startsWith('http://') || text.startsWith('https://'))) {
          item.Result = 'カーソル位置のテキストがURLではありません';
          return;
        }
        window.open(text, '_blank');
        item.Result = `URL [${text}] を開きました`;
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:File:Open',
    Description: 'OSの規定のアプリでローカルファイル/フォルダを起動します',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text) {
          item.Result = 'カーソル位置に対象テキストがありません';
          return;
        }
        if (text.startsWith('http://') || text.startsWith('https://') || (text.startsWith('[') && text.endsWith(']'))) {
          item.Result = 'カーソル位置のテキストがファイルパスではありません';
          return;
        }
        return fetch('/api/system/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: text })
        }).then(async res => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
          }
          item.Result = `パス [${text}] を起動しました`;
        }).catch(err => {
          console.error('Failed to open path', err);
          item.Result = `[エラー] パスの起動に失敗しました: ${err.message}`;
        });
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Tag:Open',
    Description: 'タグを開く、またはフィルター検索を設定します',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text || !(text.startsWith('[') && text.endsWith(']'))) {
          item.Result = 'カーソル位置のテキストがタグではありません';
          return;
        }
        const innerText = text.slice(1, -1);
        if (innerText.includes(':')) {
          const parts = innerText.split(':');
          const key = parts[0].trim();
          const val = parts.slice(1).join(':').trim();

          const WEB_SEARCH_TEMPLATES: Record<string, string> = {
            Spotify: 'https://open.spotify.com/search/{0}',
            NET: 'https://docs.microsoft.com/ja-jp/dotnet/api/?view=net-5.0&term={0}',
            VBAOutlook: 'https://docs.microsoft.com/ja-jp/search/?category=outlook&search={0}',
            Pubmed: 'https://pubmed.ncbi.nlm.nih.gov/?term={0}',
            NIPH: 'https://rctportal.niph.go.jp/s/result?t=chiken&q={0}',
            CTG: 'https://clinicaltrials.gov/ct2/results?term=&cntry=&state=&city=&dist=&cond={0}',
            Cortellis: 'https://www.cortellis.com/intelligence/qsearch/{0}?indexBased=true&searchCategory=ALL',
            PMDA: 'https://ss.pmda.go.jp/ja_all/search.x?ie=UTF-8&page=1&q={0}',
            KAKEN: 'https://kaken.nii.ac.jp/ja/search/?kw={0}',
            EMA: 'https://www.clinicaltrialsregister.eu/ctr-search/search?query={0}',
            JST: 'https://www.jstage.jst.go.jp/result/global/-char/ja?globalSearchKey={0}',
            PMC: 'https://www.ncbi.nlm.nih.gov/pmc/?term={0}',
            MHLW: 'https://www.mhlw.go.jp/search.html?q={0}',
            Google: 'https://www.google.com/search?q={0}',
            GoogleE: 'http://www.google.co.jp/search?lr=lang_en&q={0}',
            GoogleMap: 'https://www.google.co.jp/maps/place/{0}',
            GScholar: 'https://scholar.google.co.jp/scholar?q={0}',
            Youtube: 'https://www.youtube.com/results?search_query={0}',
            Wikipedia: 'https://ja.wikipedia.org/wiki/{0}',
            WikipediaE: 'https://en.wikipedia.org/wiki/{0}',
            Bing: 'https://www.bing.com/search?q={0}',
            DeepLEJ: 'https://www.deepl.com/ja/translator#en/ja/{0}',
            DeepLJE: 'https://www.deepl.com/ja/translator#ja/en-us/{0}'
          };

          const template = WEB_SEARCH_TEMPLATES[key];
          if (template) {
            const url = template.replace('{0}', encodeURIComponent(val));
            window.open(url, '_blank');
            item.Result = `WebSearch [${key}:${val}] を開きました`;
          } else if (key.toLowerCase() === 'memo' || key.toLowerCase() === 'thought' || key.toLowerCase() === 'table') {
            app.OpenThinkInWorkout(val);
            item.Result = `Think [${val}] を開きました`;
          } else {
            app.ThinktankPanel.IsAreaOpen = true;
            app.ThinktankPanel.SetViewMode('filter');
            app.ThinktankPanel.SetFilter(innerText);
            item.Result = `タグ [${innerText}] で検索しました`;
          }
        } else {
          app.ThinktankPanel.IsAreaOpen = true;
          app.ThinktankPanel.SetViewMode('filter');
          app.ThinktankPanel.SetFilter(innerText);
          item.Result = `タグ [${innerText}] で検索しました`;
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text) {
          item.Result = 'カーソル位置に対象テキストがありません';
          return;
        }

        let subActionId: ActionID;
        if (text.startsWith('http://') || text.startsWith('https://')) {
          subActionId = 'TextEditor.CurrentEditor.DoOnCursorPos:Url:Open';
        } else if (text.startsWith('[') && text.endsWith(']')) {
          subActionId = 'TextEditor.CurrentEditor.DoOnCursorPos:Tag:Open';
        } else {
          subActionId = 'TextEditor.CurrentEditor.DoOnCursorPos:File:Open';
        }

        const res = TTActions.Execute(subActionId, item.Mods);
        if (res instanceof Promise) {
          return res.then(subItem => {
            item.Result = subItem.Result;
          });
        } else {
          item.Result = res.Result;
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Menu',
    Description: 'カーソル位置のテキスト種別に応じたアクションメニューを表示します',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text) {
          item.Result = 'カーソル位置に対象テキストがありません';
          return;
        }

        const prefixMap = {
          url: 'TextEditor.CurrentEditor.DoOnCursorPos:Url:',
          filepath: 'TextEditor.CurrentEditor.DoOnCursorPos:File:',
          tag: 'TextEditor.CurrentEditor.DoOnCursorPos:Tag:'
        };

        let prefix = '';
        let typeLabel = '';
        if (text.startsWith('http://') || text.startsWith('https://')) {
          prefix = prefixMap.url;
          typeLabel = 'URL アクション';
        } else if (text.startsWith('[') && text.endsWith(']')) {
          prefix = prefixMap.tag;
          typeLabel = 'タグ アクション';
        } else {
          prefix = prefixMap.filepath;
          typeLabel = 'パス アクション';
        }

        const allActions = TTActions.GetRegisteredActions();
        const targetActions = allActions.filter(act => act.ActionID.startsWith(prefix));

        if (targetActions.length === 0) {
          item.Result = `${typeLabel}用の利用可能なアクションがありません`;
          return;
        }

        return showActionMenu(`${typeLabel}の選択: [${text}]`, targetActions, item);
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    }
  });
}

function showActionMenu(
  title: string,
  actions: { ActionID: string; Description?: string; Completion: (item: any) => void | Promise<void> }[],
  completionItem: any
): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.getElementById('action-menu-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'action-menu-overlay';
    overlay.className = 'action-menu-overlay';

    const container = document.createElement('div');
    container.className = 'action-menu-container';

    const header = document.createElement('div');
    header.className = 'action-menu-header';
    header.innerHTML = `<span>${title}</span><span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">ESCで閉じる</span>`;
    container.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'action-menu-list';

    let selectedIndex = 0;

    const renderItems = () => {
      list.innerHTML = '';
      actions.forEach((act, idx) => {
        const li = document.createElement('li');
        li.className = `action-menu-item${idx === selectedIndex ? ' selected' : ''}`;
        
        const actionParts = act.ActionID.split(':');
        const shortName = actionParts[actionParts.length - 1];

        const titleSpan = document.createElement('span');
        titleSpan.className = 'action-menu-item-title';
        titleSpan.textContent = shortName;

        const descSpan = document.createElement('span');
        descSpan.className = 'action-menu-item-desc';
        descSpan.textContent = act.Description || act.ActionID;

        li.appendChild(titleSpan);
        li.appendChild(descSpan);

        li.addEventListener('click', () => {
          executeIndex(idx);
        });

        list.appendChild(li);
      });
    };

    const executeIndex = (idx: number) => {
      cleanup();
      const act = actions[idx];
      if (act) {
        try {
          const res = act.Completion(completionItem);
          if (res instanceof Promise) {
            res.then(() => resolve()).catch(err => {
              completionItem.Result = `[エラー] ${err.message}`;
              resolve();
            });
          } else {
            resolve();
          }
        } catch (err: any) {
          completionItem.Result = `[エラー] ${err.message}`;
          resolve();
        }
      } else {
        resolve();
      }
    };

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      overlay.remove();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (e.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % actions.length;
        renderItems();
        const selectedEl = list.children[selectedIndex] as HTMLElement;
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + actions.length) % actions.length;
        renderItems();
        const selectedEl = list.children[selectedIndex] as HTMLElement;
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        executeIndex(selectedIndex);
      } else if (e.key === 'Escape') {
        cleanup();
        completionItem.Result = 'メニューの選択をキャンセルしました';
        resolve();
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        completionItem.Result = 'メニューの選択をキャンセルしました';
        resolve();
      }
    });

    document.addEventListener('keydown', handleKeyDown, { capture: true });

    renderItems();
    container.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'action-menu-footer';
    footer.textContent = '↑↓: 選択 / Enter: 決定 / Esc: キャンセル';
    container.appendChild(footer);

    overlay.appendChild(container);
    document.body.appendChild(overlay);
  });
}


