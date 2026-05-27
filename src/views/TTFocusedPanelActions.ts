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

// ── パネルごとの ViewMode 順序定義 ───────────────────────────────────────────

const PANEL_VIEW_MODES: Record<string, string[]> = {
  Thinktank:      ['filter', 'chat', 'settings'],
  Overview:       ['datagrid', 'graph', 'chat', 'settings'],
  WorkoutSetting: ['workout', 'texteditor', 'markdown', 'datagrid', 'card', 'graph'],
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
    case 'WorkoutSetting': return app.WorkoutPanel;
    case 'ReThink':        return app.ReThinkPanel;
    default:               return null;
  }
}

// ── 登録 ─────────────────────────────────────────────────────────────────────

export function registerFocusedPanelActions(app: TTApplication): void {

  TTActions.Register({
    ActionID: 'FocusedPanel.ToggleAreaVisibility',
    Completion: (item) => {
      const panel = getPanel(app);
      if (!panel) { item.Result = '[対象なし]'; return; }
      panel.ToggleArea();
      item.Result = panel.IsAreaOpen ? '開いた' : '閉じた';
    },
  });

  TTActions.Register({
    ActionID: 'FocusedPanel.SetViewModePrev',
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
    ActionID: 'FocusedPanel.SetViewModeNext',
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

function isLineFolded(editor: any, lineNumber: number): boolean {
  if (typeof editor.getHiddenAreas !== 'function') {
    throw new Error('editor.getHiddenAreas is not defined');
  }
  const hiddenAreas = editor.getHiddenAreas() || [];
  const targetLine = lineNumber + 1;
  return hiddenAreas.some((range: any) =>
    targetLine >= range.startLineNumber && targetLine <= range.endLineNumber
  );
}

export function registerTextEditorActions(): void {

  // 1. TextEditor.Folding.Forward
  TTActions.Register({
    ActionID: 'TextEditor.Folding.Forward',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeMonacoEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        let targetLine = -1;
        for (let i = pos.lineNumber - 1; i >= 1; i--) {
          if (getHeadingLevel(model.getLineContent(i)) > 0) {
            targetLine = i;
            break;
          }
        }

        if (targetLine !== -1) {
          editor.setPosition({ lineNumber: targetLine, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(targetLine);
          item.Result = `L${targetLine}へ移動`;
        } else {
          item.Result = '見出しなし';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  // 2. TextEditor.Folding.Backward
  TTActions.Register({
    ActionID: 'TextEditor.Folding.Backward',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeMonacoEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        const lineCount = model.getLineCount();
        let targetLine = -1;
        for (let i = pos.lineNumber + 1; i <= lineCount; i++) {
          if (getHeadingLevel(model.getLineContent(i)) > 0) {
            targetLine = i;
            break;
          }
        }

        if (targetLine !== -1) {
          editor.setPosition({ lineNumber: targetLine, column: 1 });
          editor.revealLineInCenterIfOutsideViewport(targetLine);
          item.Result = `L${targetLine}へ移動`;
        } else {
          item.Result = '見出しなし';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  // 3. TextEditor.Folding.OpenEachLevel
  TTActions.Register({
    ActionID: 'TextEditor.Folding.OpenEachLevel',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeMonacoEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        let headingLine = -1;
        let parentLevel = 0;
        for (let i = pos.lineNumber; i >= 1; i--) {
          const lvl = getHeadingLevel(model.getLineContent(i));
          if (lvl > 0) {
            headingLine = i;
            parentLevel = lvl;
            break;
          }
        }

        if (headingLine === -1) { item.Result = '[見出し外]'; return; }

        if (isLineFolded(editor, headingLine)) {
          editor.setPosition({ lineNumber: headingLine, column: 1 });
          editor.trigger('keyboard', 'editor.unfold', {});
          editor.setPosition(pos);
          item.Result = `L${headingLine}展開`;
          return;
        }

        const scope = getHeadingScope(model, headingLine, parentLevel);
        const maxLevel = 6;
        for (let targetLvl = parentLevel + 1; targetLvl <= maxLevel; targetLvl++) {
          const targets: number[] = [];
          for (let i = scope.start + 1; i <= scope.end; i++) {
            const lvl = getHeadingLevel(model.getLineContent(i));
            if (lvl === targetLvl) targets.push(i);
          }

          const folded = targets.filter(t => isLineFolded(editor, t));
          if (folded.length > 0) {
            folded.forEach(t => {
              editor.setPosition({ lineNumber: t, column: 1 });
              editor.trigger('keyboard', 'editor.unfold', {});
            });
            editor.setPosition(pos);
            item.Result = `Lvl${targetLvl}子展開`;
            return;
          }
        }
        item.Result = '全展開済み';
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });

  // 4. TextEditor.Folding.CloseEachLevel
  TTActions.Register({
    ActionID: 'TextEditor.Folding.CloseEachLevel',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeMonacoEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos) { item.Result = '[モデル/位置なし]'; return; }

        let headingLine = -1;
        let parentLevel = 0;
        for (let i = pos.lineNumber; i >= 1; i--) {
          const lvl = getHeadingLevel(model.getLineContent(i));
          if (lvl > 0) {
            headingLine = i;
            parentLevel = lvl;
            break;
          }
        }

        if (headingLine === -1) { item.Result = '[見出し外]'; return; }

        const scope = getHeadingScope(model, headingLine, parentLevel);
        const maxLevel = 6;
        for (let targetLvl = maxLevel; targetLvl > parentLevel; targetLvl--) {
          const targets: number[] = [];
          for (let i = scope.start + 1; i <= scope.end; i++) {
            const lvl = getHeadingLevel(model.getLineContent(i));
            if (lvl === targetLvl) targets.push(i);
          }

          const opened = targets.filter(t => !isLineFolded(editor, t));
          if (opened.length > 0) {
            opened.forEach(t => {
              editor.setPosition({ lineNumber: t, column: 1 });
              editor.trigger('keyboard', 'editor.fold', {});
            });
            editor.setPosition(pos);
            item.Result = `Lvl${targetLvl}子折畳`;
            return;
          }
        }

        if (!isLineFolded(editor, headingLine)) {
          editor.setPosition({ lineNumber: headingLine, column: 1 });
          editor.trigger('keyboard', 'editor.fold', {});
          editor.setPosition(pos);
          item.Result = `L${headingLine}折畳`;
        } else {
          item.Result = '折畳済み';
        }
      } catch (err: any) {
        item.Result = `[エラー] ${err.message}`;
      }
    },
  });
}
