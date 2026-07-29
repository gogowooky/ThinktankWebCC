/**
 * textEditorDateActions.ts
 * TextEditor.EditDate 系アクション（カーソル位置の日付文字列をExDateモードで編集する）の登録。
 *
 * 元は views/TTFocusedPanelActions.ts に同居していたが、日付編集は他のFocusedPanel
 * アクションと独立したドメインのため分離した。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { shiftDate, type RangeUnit } from '../../utils/dateUtils';
import { formatDate, findDateAtCaret } from '../../utils/japaneseDate';
import { getErrorMessage } from '../../utils/errorMessage';

export interface DateEditState {
  originalText: string;
  originalStartOffset: number;
  originalLength: number;
  currentDate: Date;
  baseFormat: 'DateTag' | 'Date' | 'JDate' | 'GDate';
  weekTimeSuffix: '' | 'W' | 'T' | 'WT';
}

let activeDateEditState: DateEditState | null = null;

export function registerTextEditorDateActions(app: TTApplication): void {
  // 1. TextEditor.EditDate.InsertExDate
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.InsertExDate',
    Description: 'カーソル位置に日付文字を挿入しExDateモードに入る',
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
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
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
    } catch (err) {
      item.Result = `[エラー] ${getErrorMessage(err)}`;
    }
  };

  // 2. ChangeFormat
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.ChangeFormat',
    Description: 'カーソル位置の日時フォーマットを変更する',
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
    Description: 'カーソル位置の曜日表示を変更する',
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
    Description: 'カーソル位置の時間表示を変更する',
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

  // 5-12. Inc/DecYear, Inc/DecMonth, Inc/DecWeek, Inc/DecDay（dateUtils.shiftDate を共用）
  const DATE_STEPS: Array<[string, RangeUnit, number, string]> = [
    ['IncYear',  'y', 1,  'カーソル位置の年を1増やす'], ['DecYear',  'y', -1, 'カーソル位置の年を1減らす'],
    ['IncMonth', 'm', 1,  'カーソル位置の月を1増やす'], ['DecMonth', 'm', -1, 'カーソル位置の月を1減らす'],
    ['IncWeek',  'w', 1,  'カーソル位置の週を1増やす'], ['DecWeek',  'w', -1, 'カーソル位置の週を1減らす'],
    ['IncDay',   'd', 1,  'カーソル位置の日を1増やす'], ['DecDay',   'd', -1, 'カーソル位置の日を1減らす'],
  ];
  for (const [suffix, unit, delta, description] of DATE_STEPS) {
    TTActions.Register({
      ActionID: `TextEditor.EditDate.${suffix}`,
      Description: description,
      Completion: (item) => {
        modifyDate(item, (state) => {
          state.currentDate = shiftDate(state.currentDate, delta, unit);
        });
      }
    });
  }

  // 13. SetNow
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.SetNow',
    Description: 'カーソル位置の日時を今にする',
    Completion: (item) => {
      modifyDate(item, (state) => {
        state.currentDate = new Date();
      });
    }
  });

  // 14. Reset
  TTActions.Register({
    ActionID: 'TextEditor.EditDate.Reset',
    Description: 'カーソル位置の日時を元に戻す',
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
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });
}
