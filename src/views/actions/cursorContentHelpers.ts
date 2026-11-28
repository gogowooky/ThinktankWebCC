/**
 * cursorContentHelpers.ts
 * カーソル位置の文字・タグを扱うアクション群（textEditorCursorContentActions.ts から呼ぶもの）の共通部品。
 */
import type { TTApplication } from '../TTApplication';
import { TTShortcutManager } from '../TTShortcutManager';
import { TTUIStateManager } from '../TTUIStateManager';
import { jumpPosition, requestEditorOpen, type EditorJump } from '../../utils/editorJump';
import { captionOfLinkFile, formatLinkTag, formatLinkTagWithCaption, linkTagOfFile, linkTagOfTarget, parseLinkFile, parseLinkTag, type LinkFile, type LinkSource } from '../../utils/linkFormat';
import { getPcName } from '../../utils/pcName';
import { findTextOnCursor } from '../../utils/textOnCursor';

/** [THINK:yyyy-MM-dd-hhmmss] と、行番号または検索語を添えた [THINK:yyyy-MM-dd-hhmmss,nnn]。
    カンマ前後の空白を許すのは、手で書き足した指定を取りこぼさないため。 */
export const THINK_ID_RE = /^(\d{4}-\d{2}-\d{2}-\d{6})(?:\s*,\s*(\S(?:.*\S)?))?\s*$/;

/**
 * ThinkをWorkingで開き、指定があればその位置へカーソルを送ってから、エディタへフォーカスする。
 * 指定は行番号（数字だけ）か検索語で、検索語のときは Highlighter にも設定して
 * 本文の先頭から最初のヒットへ送る。
 *
 * 行き先とフォーカスの与え方が2通りあるのは、開き直しでエディタが作り直されるかどうかが
 * 変わるため。<Editor> の key は ThinkID なので、フォーカス中のPaneで既に同じThinkが
 * 開いていれば作り直されない＝マウント処理も走らないので、その場のエディタを直接動かす。
 * それ以外は作り直されるので、依頼を預けてマウント時の状態復元に適用させる
 * （ここで当てにいっても、非同期に走る保存済みカーソルの復元に上書きされる）。
 */
export function openThinkAtTarget(app: TTApplication, thinkId: string, suffix?: string): string {
  const jump: EditorJump | undefined = suffix === undefined
    ? undefined
    : /^\d+$/.test(suffix) ? { kind: 'line', line: Number(suffix) } : { kind: 'search', word: suffix };
  // 検索語は本文を開く前に Highlighter へ入れる。開いた時点で色が付いていないと、
  // 送った先が「なぜそこなのか」が読めない。
  if (jump?.kind === 'search') {
    TTUIStateManager.instance.applyProperty('ToolBar.HighlighterMode.Text', jump.word);
  }

  const panel = app.WorkingPanel;
  const focused = panel.Areas.find(a => a.ID === panel.FocusedAreaId);
  const remounts = focused?.ResourceID !== thinkId;
  // OpenThinkInWorking が html だけ別メディアで開く。テキストエディタでなければ行の概念がない。
  const isTextEditor = app.Models.Vault.GetThink(thinkId)?.ContentType !== 'html';

  if (remounts && isTextEditor) requestEditorOpen(thinkId, jump);
  const area = app.OpenThinkInWorking(thinkId);

  const where = jump?.kind === 'search' ? `Highlighter [${jump.word}]` : '';
  if (!isTextEditor) {
    return `Think [${thinkId}] を開きました（テキストエディタではありません）${where ? `。${where} を設定しました` : ''}`;
  }
  if (!remounts) {
    // 作り直されない＝マウント処理が走らないので、移動もフォーカスもここで済ませる
    const editor = area ? TTShortcutManager.instance.getAreaEditor(area.ID) : null;
    if (!editor) return `Think [${thinkId}] を開きました（エディタが見つからずフォーカスできません）`;
    const position = jump ? jumpPosition(editor, jump) : null;
    if (position) {
      editor.setPosition(position);
      editor.revealPositionInCenter(position);
    }
    editor.focus();
    if (!jump) return `Think [${thinkId}] を開きました`;
    if (!position) return `Think [${thinkId}] を開き ${where} を設定しました（ヒットなし）`;
    return jump.kind === 'line'
      ? `Think [${thinkId}] のL${position.lineNumber}へ移動しました`
      : `Think [${thinkId}] で ${where} の先頭（L${position.lineNumber}:C${position.column}）へ移動しました`;
  }
  if (!jump) return `Think [${thinkId}] を開きました`;
  return jump.kind === 'line'
    ? `Think [${thinkId}] のL${jump.line}へ移動しました`
    : `Think [${thinkId}] を開き ${where} の先頭へ移動します`;
}

/** タグの種類（DoOnCursorPos:<種類>:Open の <種類>）を判別する */
export function classifyTagSubTag(text: string): string {
  if (!text.startsWith('[') || !text.endsWith(']')) return 'Think';
  if (parseLinkTag(text)) return 'Link';
  const inner = text.slice(1, -1);
  if (inner.startsWith(':')) return 'Anchor';
  const colonIdx = inner.indexOf(':');
  if (colonIdx < 0) return 'Think'; // [TAG] プレーンタグ → Thinkフィルター
  const key = inner.slice(0, colonIdx).trim().toLowerCase();
  switch (key) {
    case 'googleroute': return 'GoogleRoute';
    case 'yahootransfer': return 'YahooTransfer';
    case 'think': case 'thinktank': case 'memo': case 'aiview': case 'aiwork': return 'Think';
    case 'mail': return 'Mail';
    // Project の # AI議論 に並ぶ [chat:ID] は検索ではなくそのchatを開く
    case 'chat': return THINK_ID_RE.test(inner.slice(colonIdx + 1).trim()) ? 'Think' : 'Chat';
    case 'ai':
    case 'gemini':
    case 'chatgpt':
    case 'claude':
    case 'gpt':
      return 'AI';
    default: return 'WebSearch';
  }
}

/**
 * 複数のアクション群が使う、アクティブなエディタのカーソル位置と Vault に依存する補助関数。
 */
export function cursorContentHelpers(app: TTApplication) {
  function getCurrentTextOnCursor(): string {
    const editor = TTShortcutManager.instance.activeEditor;
    if (!editor) return '';
    const pos = editor.getPosition();
    const model = editor.getModel();
    if (!pos || !model) return '';

    return findTextOnCursor(model.getLineContent(pos.lineNumber), pos.column);
  }

  function getTextOnCursorSafe(): string {
    return getCurrentTextOnCursor() || TTUIStateManager.instance.getProperty('TextEditor.CurrentEditor.TextOnCursorPos') || '';
  }

  /**
   * Thinkファイルを本文から参照するタグ。linkファイルはリンク先に応じた [gdrive:ID] 等（Caption 付き）、
   * それ以外は [memo:ID]（Thinkドロップの Insert と Pane の「タグをコピー」で共通）。
   */
  async function thinkRefTag(thinkId: string): Promise<string> {
    const think = app.Models.Vault.GetThink(thinkId);
    if (think?.ContentType !== 'links') return `[memo:${thinkId}]`;
    if (think.IsMetaOnly) await think.LoadContent();
    const file = parseLinkFile(think.Content);
    return file
      ? formatLinkTagWithCaption(linkTagOfFile(file), thinkId, captionOfLinkFile(file))
      : formatLinkTag('link', thinkId);
  }

  /**
   * URL/パスの linkファイルを用意して参照タグ（Caption 付き）を返す。
   * 同じリンク先の linkファイルがあればそれを使う。Seeds で開いているProjectがあれば登録する。
   */
  async function linkTagForSource(source: LinkSource): Promise<string> {
    const pcName = await getPcName();
    const seedsProjectId = app.SeedsPanel?.ProjectID;
    const { think: linkThink } = seedsProjectId
      ? await app.Models.Vault.GetOrCreateLinksThink(source, pcName, seedsProjectId)
      : await app.Models.Vault.GetOrCreateLinksThink(source, pcName);
    // 既存のlinkファイルを使う場合も、そのファイルの Caption を添える
    if (linkThink.IsMetaOnly) await linkThink.LoadContent();
    const file = parseLinkFile(linkThink.Content);
    return file
      ? formatLinkTagWithCaption(linkTagOfFile(file), linkThink.ID, captionOfLinkFile(file))
      : formatLinkTag(linkTagOfTarget(source.target, source.isDirectory), linkThink.ID);
  }

  /** カーソル位置の [gdrive:ID] 等が指す linkファイルを読む。読めなければ理由の文字列 */
  const linkFileOnCursor = async (): Promise<{ thinkId: string; file: LinkFile } | string> => {
    const tag = parseLinkTag(getTextOnCursorSafe());
    if (!tag) return 'カーソル位置のテキストがLinkタグではありません';
    const think = app.Models.Vault.GetThink(tag.thinkId);
    if (!think) return `linkファイル [${tag.thinkId}] が見つかりません`;
    if (think.IsMetaOnly) await think.LoadContent();
    const file = parseLinkFile(think.Content);
    if (!file) return `linkファイル [${tag.thinkId}] にリンク先が書かれていません`;
    return { thinkId: tag.thinkId, file };
  };

  return { getTextOnCursorSafe, thinkRefTag, linkTagForSource, linkFileOnCursor };
}
