import type { PropSpec } from './types';
import { parseBool } from './stateHelpers';

export const toolbarSpecs: Record<string, PropSpec> = {
  'ToolBar.Mode.Name': {
    panel: 'DiscussPanel',
    default: 'Copyright', type: 'string',
    candidates: '^(Status|Highlighter|KeyAction|Command|Search|Reminder|Copyright)$',
    description: 'Toolバー表示モード',
    get: (app) => app.DiscussPanel.ToolBarMode,
    set: (app, v) => { app.DiscussPanel.ToolBarMode = v; },
  },
  'ToolBar.StatusMode.Text': {
    panel: 'DiscussPanel',
    default: 'ThinktankPanel.Mode.Name,SeedsPanel.Mode.Name,DiscussSettingPanel.Mode.Name',
    type: 'string',
    candidates: '.*',
    description: 'ステータスバー表示項目 (CSV)',
    get: (app) => app.DiscussPanel.StatusModeText,
    set: (app, v) => { app.DiscussPanel.StatusModeText = v; },
  },
  'ToolBar.HighlighterMode.Text': {
    panel: 'DiscussPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'ハイライターの入力テキスト',
    get: (app) => app.DiscussPanel.HighlightWord || '',
    set: (app, v) => { app.DiscussPanel.HighlightWord = v; },
  },
  'ToolBar.HighlighterMode.MatchCase': {
    panel: 'DiscussPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'ハイライターの大文字小文字を区別する (aA)',
    get: (app) => String(app.DiscussPanel.HighlightMatchCase),
    set: (app, v) => { app.DiscussPanel.HighlightMatchCase = parseBool(v, app.DiscussPanel.HighlightMatchCase); },
  },
  'ToolBar.HighlighterMode.IsRegex': {
    panel: 'DiscussPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'ハイライターの正規表現モード (.*)',
    get: (app) => String(app.DiscussPanel.HighlightIsRegex),
    set: (app, v) => { app.DiscussPanel.HighlightIsRegex = parseBool(v, app.DiscussPanel.HighlightIsRegex); },
  },
  'ToolBar.HighlighterMode.MatchWidth': {
    panel: 'DiscussPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'ハイライターの全角半角を区別する (全半)',
    get: (app) => String(app.DiscussPanel.HighlightMatchWidth),
    set: (app, v) => { app.DiscussPanel.HighlightMatchWidth = parseBool(v, app.DiscussPanel.HighlightMatchWidth); },
  },
  'ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag': {
    panel: 'DiscussPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'コンテンツで絞込みのキーワードをハイライトする',
    get: (app) => String(app.DiscussPanel.AddContentSearchKeywordFlag),
    set: (app, v) => { app.DiscussPanel.AddContentSearchKeywordFlag = parseBool(v, app.DiscussPanel.AddContentSearchKeywordFlag); },
  },
  'ToolBar.HighlighterMode.Text:AddTitleSearchKeywordFlag': {
    panel: 'DiscussPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'タイトルで絞込みのキーワードをハイライトする',
    get: (app) => String(app.DiscussPanel.AddTitleSearchKeywordFlag),
    set: (app, v) => { app.DiscussPanel.AddTitleSearchKeywordFlag = parseBool(v, app.DiscussPanel.AddTitleSearchKeywordFlag); },
  },
  'ToolBar.CommandMode.Text': {
    panel: 'DiscussPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'コマンドラインの入力テキスト',
    get: (app) => app.DiscussPanel.CommandText || '',
    set: (app, v) => { app.DiscussPanel.CommandText = v; },
  },
  'ToolBar.SearchMode.Text': {
    panel: 'DiscussPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'キーワード検索の入力テキスト',
    get: (app) => app.DiscussPanel.SearchText || '',
    set: (app, v) => { app.DiscussPanel.SearchText = v; },
  },
  'ToolBar.SearchMode.Text:SearchID': {
    panel: 'DiscussPanel',
    default: 'Google', type: 'string', candidates: '.*',
    description: '入力文字の検索サイトID',
    get: (app) => app.DiscussPanel.SearchSiteID,
    set: (app, v) => { app.DiscussPanel.SearchSiteID = v.trim() || 'Google'; },
  },
  'ToolBar.ReminderMode.Text': {
    panel: 'DiscussPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'リマインダーの入力テキスト',
    get: (app) => app.DiscussPanel.ReminderText || '',
    set: (app, v) => { app.DiscussPanel.ReminderText = v; },
  }
};
