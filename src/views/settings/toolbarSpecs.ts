import type { PropSpec } from './types';
import { parseBool } from './stateHelpers';

export const toolbarSpecs: Record<string, PropSpec> = {
  'ToolBar.Mode.Name': {
    panel: 'WorkingPanel',
    default: 'Copyright', type: 'string',
    candidates: '^(Status|Highlighter|KeyAction|Command|Search|Reminder|Copyright)$',
    description: 'Toolバー表示モード',
    get: (app) => app.WorkingPanel.ToolBarMode,
    set: (app, v) => { app.WorkingPanel.ToolBarMode = v; },
  },
  'ToolBar.StatusMode.Text': {
    panel: 'WorkingPanel',
    default: 'ThinktankPanel.Mode.Name,SeedsPanel.Mode.Name,WorkingSettingPanel.Mode.Name',
    type: 'string',
    candidates: '.*',
    description: 'ステータスバー表示項目 (CSV)',
    get: (app) => app.WorkingPanel.StatusModeText,
    set: (app, v) => { app.WorkingPanel.StatusModeText = v; },
  },
  'ToolBar.HighlighterMode.Text': {
    panel: 'WorkingPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'ハイライターの入力テキスト',
    get: (app) => app.WorkingPanel.HighlightWord || '',
    set: (app, v) => { app.WorkingPanel.HighlightWord = v; },
  },
  'ToolBar.HighlighterMode.MatchCase': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'ハイライターの大文字小文字を区別する (aA)',
    get: (app) => String(app.WorkingPanel.HighlightMatchCase),
    set: (app, v) => { app.WorkingPanel.HighlightMatchCase = parseBool(v, app.WorkingPanel.HighlightMatchCase); },
  },
  'ToolBar.HighlighterMode.IsRegex': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'ハイライターの正規表現モード (.*)',
    get: (app) => String(app.WorkingPanel.HighlightIsRegex),
    set: (app, v) => { app.WorkingPanel.HighlightIsRegex = parseBool(v, app.WorkingPanel.HighlightIsRegex); },
  },
  'ToolBar.HighlighterMode.MatchWidth': {
    panel: 'WorkingPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'ハイライターの全角半角を区別する (全半)',
    get: (app) => String(app.WorkingPanel.HighlightMatchWidth),
    set: (app, v) => { app.WorkingPanel.HighlightMatchWidth = parseBool(v, app.WorkingPanel.HighlightMatchWidth); },
  },
  'ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag': {
    panel: 'WorkingPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'コンテンツで絞込みのキーワードをハイライトする',
    get: (app) => String(app.WorkingPanel.AddContentSearchKeywordFlag),
    set: (app, v) => { app.WorkingPanel.AddContentSearchKeywordFlag = parseBool(v, app.WorkingPanel.AddContentSearchKeywordFlag); },
  },
  'ToolBar.HighlighterMode.Text:AddTitleSearchKeywordFlag': {
    panel: 'WorkingPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'タイトルで絞込みのキーワードをハイライトする',
    get: (app) => String(app.WorkingPanel.AddTitleSearchKeywordFlag),
    set: (app, v) => { app.WorkingPanel.AddTitleSearchKeywordFlag = parseBool(v, app.WorkingPanel.AddTitleSearchKeywordFlag); },
  },
  'ToolBar.CommandMode.Text': {
    panel: 'WorkingPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'コマンドラインの入力テキスト',
    get: (app) => app.WorkingPanel.CommandText || '',
    set: (app, v) => { app.WorkingPanel.CommandText = v; },
  },
  'ToolBar.SearchMode.Text': {
    panel: 'WorkingPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'キーワード検索の入力テキスト',
    get: (app) => app.WorkingPanel.SearchText || '',
    set: (app, v) => { app.WorkingPanel.SearchText = v; },
  },
  'ToolBar.SearchMode.Text:SearchID': {
    panel: 'WorkingPanel',
    default: 'Google', type: 'string', candidates: '.*',
    description: '入力文字の検索サイトID',
    get: (app) => app.WorkingPanel.SearchSiteID,
    set: (app, v) => { app.WorkingPanel.SearchSiteID = v.trim() || 'Google'; },
  },
  'ToolBar.ReminderMode.Text': {
    panel: 'WorkingPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'リマインダーの入力テキスト',
    get: (app) => app.WorkingPanel.ReminderText || '',
    set: (app, v) => { app.WorkingPanel.ReminderText = v; },
  }
};
