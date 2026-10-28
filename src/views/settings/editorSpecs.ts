import { DEFAULT_MARKS, parseMarks } from '../../utils/defaultColor';
import { TTShortcutManager } from '../TTShortcutManager';
import type { PropSpec } from './types';
import { parseBool } from './stateHelpers';

export const editorSpecs: Record<string, PropSpec> = {
  'TextEditor.FindOption.MatchCase': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '検索オプション：大文字小文字を区別',
    get: (app) => String(app.WorkingPanel.TextEditor.FindOption.MatchCase),
    set: (app, v) => { app.WorkingPanel.TextEditor.FindOption.MatchCase = parseBool(v, app.WorkingPanel.TextEditor.FindOption.MatchCase); },
  },
  'TextEditor.FindOption.MatchWholeWord': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '検索オプション：単語単位で検索',
    get: (app) => String(app.WorkingPanel.TextEditor.FindOption.MatchWholeWord),
    set: (app, v) => { app.WorkingPanel.TextEditor.FindOption.MatchWholeWord = parseBool(v, app.WorkingPanel.TextEditor.FindOption.MatchWholeWord); },
  },
  'TextEditor.FindOption.UseRexp': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '検索オプション：正規表現を使用',
    get: (app) => String(app.WorkingPanel.TextEditor.FindOption.UseRexp),
    set: (app, v) => { app.WorkingPanel.TextEditor.FindOption.UseRexp = parseBool(v, app.WorkingPanel.TextEditor.FindOption.UseRexp); },
  },
  'TextEditor.ReplaceOption.PreserveCase': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '置換オプション：大文字小文字を保持',
    get: (app) => String(app.WorkingPanel.TextEditor.ReplaceOption.PreserveCase),
    set: (app, v) => { app.WorkingPanel.TextEditor.ReplaceOption.PreserveCase = parseBool(v, app.WorkingPanel.TextEditor.ReplaceOption.PreserveCase); },
  },
  'TextEditor.LineNumbers.IsVisible': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '行番号表示',
    get: (app) => String(app.WorkingPanel.TextEditor.LineNumbers.IsVisible),
    set: (app, v) => { app.WorkingPanel.TextEditor.LineNumbers.IsVisible = parseBool(v, app.WorkingPanel.TextEditor.LineNumbers.IsVisible); },
  },
  'TextEditor.Bullet.Marks': {
    panel: 'WorkingPanel',
    default: DEFAULT_MARKS.Bullet, type: 'string', candidates: '.*',
    description: '箇条書きの行頭記号（CSV。n番目が TextEditor.Bullet.StyleN に対応）',
    get: (app) => app.WorkingPanel.TextEditor.Bullet.Marks,
    set: (app, v) => { app.WorkingPanel.TextEditor.Bullet.Marks = v; },
  },
  'TextEditor.Bullet.StyleNum': {
    panel: 'WorkingPanel',
    default: String(parseMarks(DEFAULT_MARKS.Bullet).length),
    type: 'integer', candidates: '^[0-9]+$',
    // Marks のアイテム数そのものなので直接は書き換えられない（登録数を変えるには Marks を編集する）
    description: '箇条書きスタイルの登録数（TextEditor.Bullet.Marks のアイテム数）',
    get: (app) => String(parseMarks(app.WorkingPanel.TextEditor.Bullet.Marks).length),
    set: () => { },
  },
  'TextEditor.Comment.Marks': {
    panel: 'WorkingPanel',
    default: DEFAULT_MARKS.Comment, type: 'string', candidates: '.*',
    description: 'コメントの行頭記号（CSV。n番目が TextEditor.Comment.StyleN に対応）',
    get: (app) => app.WorkingPanel.TextEditor.Comment.Marks,
    set: (app, v) => { app.WorkingPanel.TextEditor.Comment.Marks = v; },
  },
  'TextEditor.Comment.StyleNum': {
    panel: 'WorkingPanel',
    default: String(parseMarks(DEFAULT_MARKS.Comment).length),
    type: 'integer', candidates: '^[0-9]+$',
    // Bullet.StyleNum と同じく Marks のアイテム数そのもの（直接は書き換えられない）
    description: 'コメントスタイルの登録数（TextEditor.Comment.Marks のアイテム数）',
    get: (app) => String(parseMarks(app.WorkingPanel.TextEditor.Comment.Marks).length),
    set: () => { },
  },
  'TextEditor.WordWrap.IsVisible': {
    panel: 'WorkingPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '折り返し',
    get: (app) => String(app.WorkingPanel.TextEditor.WordWrap.IsVisible),
    set: (app, v) => { app.WorkingPanel.TextEditor.WordWrap.IsVisible = parseBool(v, app.WorkingPanel.TextEditor.WordWrap.IsVisible); },
  },
  'TextEditor.Minimap.IsVisible': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'ミニマップ',
    get: (app) => String(app.WorkingPanel.TextEditor.Minimap.IsVisible),
    set: (app, v) => { app.WorkingPanel.TextEditor.Minimap.IsVisible = parseBool(v, app.WorkingPanel.TextEditor.Minimap.IsVisible); },
  },
  'TextEditor.FullWidthSpace.IsVisible': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '全角スペース表示',
    get: (app) => String(app.WorkingPanel.TextEditor.FullWidthSpace.IsVisible),
    set: (app, v) => { app.WorkingPanel.TextEditor.FullWidthSpace.IsVisible = parseBool(v, app.WorkingPanel.TextEditor.FullWidthSpace.IsVisible); },
  },
  'TextEditor.UnicodeHighlight.IsVisible': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'Unicode強調',
    get: (app) => String(app.WorkingPanel.TextEditor.UnicodeHighlight.IsVisible),
    set: (app, v) => { app.WorkingPanel.TextEditor.UnicodeHighlight.IsVisible = parseBool(v, app.WorkingPanel.TextEditor.UnicodeHighlight.IsVisible); },
  },
  'TextEditor.BracketPairColorization.IsVisible': {
    panel: 'WorkingPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '括弧ペア色分け',
    get: (app) => String(app.WorkingPanel.TextEditor.BracketPairColorization.IsVisible),
    set: (app, v) => { app.WorkingPanel.TextEditor.BracketPairColorization.IsVisible = parseBool(v, app.WorkingPanel.TextEditor.BracketPairColorization.IsVisible); },
  },
  'TextEditor.CurrentFolding.HeadingOffset': {
    panel: 'WorkingPanel',
    default: '0', type: 'string', candidates: '.*',
    description: 'カーソル位置が属する見出し行の開始位置（先頭文字位置）',
    isConst: true,
    get: (app) => app.WorkingPanel.TextEditor.CurrentFoldingHeadingOffset ?? '0',
    set: (app, v) => { app.WorkingPanel.TextEditor.CurrentFoldingHeadingOffset = v; },
  },
  'TextEditor.CurrentFolding.HeadingNumber': {
    panel: 'WorkingPanel',
    default: 'None', type: 'string', candidates: '.*',
    description: 'カーソル位置が属する見出し行の番号(例: 1.3.4)',
    isConst: true,
    get: (app) => app.WorkingPanel.TextEditor.CurrentFoldingHeadingNumber ?? 'None',
    set: (app, v) => { app.WorkingPanel.TextEditor.CurrentFoldingHeadingNumber = v; },
  },
  'TextEditor.CurrentEditor.CursorPos': {
    panel: 'WorkingPanel',
    default: '0', type: 'string', candidates: '.*',
    description: '現在のエディタのカーソル位置',
    isConst: true,
    get: (app) => app.WorkingPanel.TextEditor.CurrentEditorCursorPos ?? '0',
    set: (app, v) => {
      app.WorkingPanel.TextEditor.CurrentEditorCursorPos = v;
      const offset = parseInt(v, 10);
      if (!isNaN(offset)) {
        const editor = TTShortcutManager.instance.activeEditor;
        if (editor) {
          const model = editor.getModel();
          if (model) {
            const pos = model.getPositionAt(offset);
            const curPos = editor.getPosition();
            if (curPos && (curPos.lineNumber !== pos.lineNumber || curPos.column !== pos.column)) {
              editor.setPosition(pos);
              editor.revealPositionInCenterIfOutsideViewport(pos);
            }
          }
        }
      }
    },
  },
  'TextEditor.CurrentEditor.TextOnCursorPos': {
    panel: 'WorkingPanel',
    default: '', type: 'string', candidates: '.*',
    description: '現在のエディタのカーソル位置のテキスト',
    isConst: true,
    get: (app) => app.WorkingPanel.TextEditor.CurrentEditorTextOnCursorPos ?? '',
    set: (app, v) => { app.WorkingPanel.TextEditor.CurrentEditorTextOnCursorPos = v; },
  }
};
