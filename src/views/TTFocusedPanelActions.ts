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
  const lineCount = model.getLineCount();

  for (let h = 1; h < lineNumber; h++) {
    const lvl = getHeadingLevel(model.getLineContent(h));
    if (lvl === 0) continue;
    if (!isLineFolded(editor, h)) continue;

    // h の fold スコープの末尾を計算（同レベル以下の次見出しの直前行）
    let scopeEnd = lineCount;
    for (let j = h + 1; j <= lineCount; j++) {
      const jLvl = getHeadingLevel(model.getLineContent(j));
      if (jLvl > 0 && jLvl <= lvl) {
        scopeEnd = j - 1;
        break;
      }
    }

    if (lineNumber <= scopeEnd) return false; // h のスコープ内 → 隠れている
  }

  return true;
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

        let targetLine = -1;
        for (let i = pos.lineNumber - 1; i >= 1; i--) {
          if (getHeadingLevel(model.getLineContent(i)) > 0 && isLineVisible(editor, i, model)) {
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

        const lineCount = model.getLineCount();
        let targetLine = -1;
        for (let i = pos.lineNumber + 1; i <= lineCount; i++) {
          if (getHeadingLevel(model.getLineContent(i)) > 0 && isLineVisible(editor, i, model)) {
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

export interface HeadingAttribute {
  offset: number;
  headingNumber: string;
  isHidden: boolean;
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

      // 非表示フラグの判定
      const isHidden = !isLineVisible(editor, i, model);

      attributes.push({
        offset,
        headingNumber,
        isHidden,
      });
    }
  }

  return attributes;
}
