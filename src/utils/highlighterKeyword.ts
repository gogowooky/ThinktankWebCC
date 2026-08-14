/**
 * highlighterKeyword.ts
 * Think一覧/AI相談の「コンテンツで絞込み」「タイトルで絞込み」実行時に、
 * 対応するON/OFFフラグ（ToolBar.HighlighterMode.Text:Add*SearchKeywordFlag）が
 * trueであればキーワードをHighlighter検索語（ToolBar.HighlighterMode.Text）へ追加する。
 */
import { TTUIStateManager } from '../views/TTUIStateManager';

/** キーワードをHighlighter検索語に追加する（既存グループに同じ語があれば何もしない） */
function addHighlighterKeyword(keyword: string): void {
  const trimmed = keyword.trim();
  if (!trimmed) return;

  const current = TTUIStateManager.instance.getProperty('ToolBar.HighlighterMode.Text');
  const groups = current.split(',').map(g => g.trim()).filter(g => g.length > 0);
  if (groups.includes(trimmed)) return;

  groups.push(trimmed);
  TTUIStateManager.instance.applyProperty('ToolBar.HighlighterMode.Text', groups.join(','));
}

/** 「コンテンツで絞込み」実行時に呼ぶ。フラグがtrueの場合のみキーワードを追加する */
export function addContentSearchKeywordToHighlighter(keyword: string): void {
  if (TTUIStateManager.instance.getProperty('ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag') === 'true') {
    addHighlighterKeyword(keyword);
  }
}

/** 「タイトルで絞込み」実行時に呼ぶ。フラグがtrueの場合のみキーワードを追加する */
export function addTitleSearchKeywordToHighlighter(keyword: string): void {
  if (TTUIStateManager.instance.getProperty('ToolBar.HighlighterMode.Text:AddTitleSearchKeywordFlag') === 'true') {
    addHighlighterKeyword(keyword);
  }
}
