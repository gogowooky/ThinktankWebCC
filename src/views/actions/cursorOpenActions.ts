/**
 * cursorOpenActions.ts
 * カーソル位置の URL・パス・検索タグ・Thinkタグ・Linkタグを開くアクション（DoOnCursorPos:*:Open）。
 *
 * registerTextEditorCursorContentActions（textEditorCursorContentActions.ts）から順に呼ばれる。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { getErrorMessage } from '../../utils/errorMessage';
import { isLocalPathTarget, parseLinkTag } from '../../utils/linkFormat';
import { getEffectiveSearchTagUrls, buildGoogleRouteUrl, buildYahooTransferUrl } from '../../utils/searchTagUrls';
import { cursorContentHelpers, THINK_ID_RE, openThinkAtTarget } from './cursorContentHelpers';

export function registerCursorOpenActions(app: TTApplication): void {
  const { getTextOnCursorSafe, linkFileOnCursor } = cursorContentHelpers(app);

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
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
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
        const system = window.electronAPI?.system;
        if (!system) {
          item.Result = 'ローカルファイルの起動はPC版（Electron）でのみ利用できます';
          return;
        }
        return system.openPath(text).then(res => {
          if (!res.ok) throw new Error(res.error);
          item.Result = `パス [${text}] を起動しました`;
        }).catch((err: unknown) => {
          console.error('Failed to open path', err);
          item.Result = `[エラー] パス [${text}] の起動に失敗しました: ${getErrorMessage(err)}`;
        });
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:WebSearch:Open',
    Description: 'タグのキーに対応する検索テンプレートでブラウザを開きます',
    Completion: async (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text || !text.startsWith('[') || !text.endsWith(']')) {
          item.Result = 'カーソル位置のテキストがWebSearchタグではありません';
          return;
        }
        const inner = text.slice(1, -1);
        const colonIdx = inner.indexOf(':');
        if (colonIdx < 0) {
          item.Result = 'WebSearchタグにはキーが必要です（例：[Google:キーワード]）';
          return;
        }
        const key = inner.slice(0, colonIdx).trim();
        const val = inner.slice(colonIdx + 1).trim();
        const WEB_SEARCH_TEMPLATES = await getEffectiveSearchTagUrls();
        const template = WEB_SEARCH_TEMPLATES[key.toLowerCase()];
        if (!template) {
          item.Result = `検索テンプレート [${key}] が見つかりません`;
          return;
        }
        const url = template.replace('{0}', encodeURIComponent(val));
        window.open(url, '_blank');
        item.Result = `WebSearch [${key}:${val}] を開きました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  /** [ID:引数] タグの引数部分。タグでなければ null */
  const tagArgOnCursor = (): string | null => {
    const text = getTextOnCursorSafe();
    if (!text || !text.startsWith('[') || !text.endsWith(']')) return null;
    const inner = text.slice(1, -1);
    const colonIdx = inner.indexOf(':');
    return colonIdx < 0 ? null : inner.slice(colonIdx + 1);
  };

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:GoogleRoute:Open',
    Description: 'Google Mapsで複数地点のルートを表示します',
    Completion: (item) => {
      try {
        const arg = tagArgOnCursor();
        if (arg === null) { item.Result = 'カーソル位置のテキストがGoogleRouteタグではありません'; return; }
        const built = buildGoogleRouteUrl(arg);
        if ('error' in built) { item.Result = built.error; return; }
        window.open(built.url, '_blank');
        item.Result = `Google Mapsルート [${built.label}] を開きました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:YahooTransfer:Open',
    Description: 'Yahoo乗換案内で電車の乗換を検索します',
    Completion: (item) => {
      try {
        const arg = tagArgOnCursor();
        if (arg === null) { item.Result = 'カーソル位置のテキストがYahooTransferタグではありません'; return; }
        const built = buildYahooTransferUrl(arg);
        if ('error' in built) { item.Result = built.error; return; }
        window.open(built.url, '_blank');
        item.Result = `Yahoo乗換案内 [${built.label}] を開きました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Think:Open',
    Description: 'ThinkファイルをIDで開く、またはタイトル・コンテンツでフィルター検索します',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text || !text.startsWith('[') || !text.endsWith(']')) {
          item.Result = 'カーソル位置のテキストがThinkタグではありません';
          return;
        }
        const inner = text.slice(1, -1);
        const colonIdx = inner.indexOf(':');
        if (colonIdx < 0) {
          // [TAG] プレーンタグ → タイトルフィルター
          app.ThinktankPanel.IsAreaOpen = true;
          app.ThinktankPanel.SetViewMode('filter');
          app.ThinktankPanel.SetFilter(inner);
          item.Result = `タグ [${inner}] でタイトル検索しました`;
          return;
        }
        const val = inner.slice(colonIdx + 1).trim();
        if (val.startsWith('>')) {
          // [THINK:>keywords] → コンテンツフィルター
          const keywords = val.slice(1).trim();
          app.ThinktankPanel.IsAreaOpen = true;
          app.ThinktankPanel.SetViewMode('filter');
          app.ThinktankPanel.SetContentFilter(keywords);
          item.Result = `コンテンツ [${keywords}] で検索しました`;
        } else if (THINK_ID_RE.test(val)) {
          // [THINK:id]         → ThinkをIDで直接開く
          // [THINK:id,行番号]   → 開いたうえでその行へカーソルを送る
          // [THINK:id,検索語]   → 開いたうえで検索語をHighlighterに設定し、先頭のヒットへ送る
          const [, thinkId, suffix] = THINK_ID_RE.exec(val)!;
          item.Result = openThinkAtTarget(app, thinkId, suffix);
        } else {
          // [THINK:keywords] / [MEMO:keywords] → 全種別を対象にタイトル欄に入力して検索
          app.ThinktankPanel.IsAreaOpen = true;
          app.ThinktankPanel.SetViewMode('filter');
          app.ThinktankPanel.SetFilter(val);
          app.ThinktankPanel.ShouldResetTypesToAll = true;
          app.ThinktankPanel.NotifyUpdated();
          item.Result = `全種別を対象に [${val}] でタイトル検索しました`;
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Link:Open',
    Description: 'Linkタグ（[link:ID] [gdrive:ID] [file:ID] 等）が指す linkファイルのリンク先を開きます',
    Completion: async (item) => {
      try {
        const resolved = await linkFileOnCursor();
        if (typeof resolved === 'string') { item.Result = resolved; return; }
        const target = resolved.file.link;
        if (isLocalPathTarget(target)) {
          const system = window.electronAPI?.system;
          if (!system) { item.Result = 'ローカルファイルの起動はPC版（Electron）でのみ利用できます'; return; }
          const res = await system.openPath(target);
          if (!res.ok) throw new Error(res.error);
          item.Result = `パス [${target}] を起動しました`;
          return;
        }
        // javascript: 等を window.open に渡さない
        if (!/^https?:\/\//i.test(target)) { item.Result = `リンク先 [${target}] はブラウザで開けない形式です`; return; }
        window.open(target, '_blank');
        item.Result = `URL [${target}] を開きました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:LinkFile:Open',
    Description: 'Linkタグが指す linkファイル自体をWorkingで開きます',
    Completion: (item) => {
      try {
        const tag = parseLinkTag(getTextOnCursorSafe());
        if (!tag) { item.Result = 'カーソル位置のテキストがLinkタグではありません'; return; }
        item.Result = openThinkAtTarget(app, tag.thinkId);
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });
}
