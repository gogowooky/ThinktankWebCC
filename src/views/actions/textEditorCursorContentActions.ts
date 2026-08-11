/**
 * textEditorCursorContentActions.ts
 * TextEditor.CurrentEditor.DoOnCursorPos:* アクション（カーソル位置のURL/パス/タグを
 * 判別して対応する外部連携を実行する）と、WorkoutPanel.DroppedFile:* アクション
 * （Think のドラッグ&ドロップ処理）の登録。
 *
 * 元は views/TTFocusedPanelActions.ts の registerTextEditorCursorPosActions に同居していたが、
 * 独立したドメインのため分離した。
 */
import type { TTApplication } from '../TTApplication';
import type { ActionID, TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { TTUIStateManager } from '../TTUIStateManager';
import { showActionMenu } from '../../utils/actionMenu';
import { getErrorMessage } from '../../utils/errorMessage';
import { apiFetch } from '../../services/apiClient';

// ── 検索タグキャッシュ ────────────────────────────────────────────────────────
let _searchTagCache: Record<string, string> | null = null;
// 一覧の取得自体に失敗した場合の理由（「該当キーなし」と区別して表示するため）
let _searchTagLoadError: string | null = null;

async function getSearchTags(): Promise<Record<string, string>> {
  if (_searchTagCache) return _searchTagCache;
  _searchTagLoadError = null;
  try {
    const res = await apiFetch('/api/system/search-tags');
    if (res.ok) {
      const raw = await res.json() as Record<string, string>;
      // キーを小文字化して大文字・小文字を問わず検索できるようにする
      _searchTagCache = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v])
      );
    } else {
      _searchTagLoadError = `検索テンプレート一覧の取得に失敗しました（HTTP ${res.status}）`;
    }
  } catch (err) {
    _searchTagLoadError = `検索テンプレート一覧の取得に失敗しました（サーバー未起動の可能性）: ${getErrorMessage(err)}`;
  }
  return _searchTagCache ?? {};
}

export function registerTextEditorCursorContentActions(app: TTApplication): void {
  function getCurrentTextOnCursor(): string {
    const editor = TTShortcutManager.instance.activeEditor;
    if (!editor) return '';
    const pos = editor.getPosition();
    const model = editor.getModel();
    if (!pos || !model) return '';

    const lineNumber = pos.lineNumber;
    const column = pos.column;
    const lineContent = model.getLineContent(lineNumber);

    const quotedRegex = /"([^"]+)"/g;
    const urlRegex = /https?:\/\/[^\s")]+/g;
    const fileRegex = /([a-zA-Z]:\\|\\\\)[^\s"<>|?*]+/g;
    const tagRegex = /\[([^\]]+)\]/g;

    let textOnCursor = '';
    let match;

    // 1. まずダブルクォーテーションで囲まれたURIやファイルパスを最優先で探索する
    while ((match = quotedRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1;
      const endCol = startCol + match[0].length;
      if (column >= startCol && column <= endCol) {
        const content = match[1];
        const isUri = /^https?:\/\//i.test(content) || /^file:\/\//i.test(content);
        const isFilePath = /^([a-zA-Z]:\\|\\\\)/.test(content) || /^([a-zA-Z]:\/)/.test(content);
        if (isUri || isFilePath) {
          textOnCursor = content;
          break;
        }
      }
    }

    // 2. ダブルクォーテーションに合致しなかった場合は従来のマッチングを行う
    if (!textOnCursor) {
      while ((match = urlRegex.exec(lineContent)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        if (column >= startCol && column <= endCol) {
          textOnCursor = match[0];
          break;
        }
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
        return apiFetch('/api/system/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: text })
        }).then(async res => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
          }
          item.Result = `パス [${text}] を起動しました`;
        }).catch((err: unknown) => {
          console.error('Failed to open path', err);
          item.Result = `[エラー] パスの起動に失敗しました: ${getErrorMessage(err)}`;
        });
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  // タグのsubTypeを判別するヘルパー
  function classifyTagSubTag(text: string): string {
    if (!text.startsWith('[') || !text.endsWith(']')) return 'Think';
    const inner = text.slice(1, -1);
    if (inner.startsWith(':')) return 'Anchor';
    const colonIdx = inner.indexOf(':');
    if (colonIdx < 0) return 'Think'; // [TAG] プレーンタグ → Thinkフィルター
    const key = inner.slice(0, colonIdx).trim().toLowerCase();
    switch (key) {
      case 'googleroute':   return 'GoogleRoute';
      case 'yahootransfer': return 'YahooTransfer';
      case 'think': case 'thinktank': case 'memo': return 'Think';
      case 'mail':          return 'Mail';
      case 'chat':          return 'Chat';
      case 'ai':
      case 'gemini':
      case 'chatgpt':
      case 'claude':
      case 'gpt':
        return 'AI';
      default:              return 'WebSearch';
    }
  }

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
        const WEB_SEARCH_TEMPLATES = await getSearchTags();
        const template = WEB_SEARCH_TEMPLATES[key.toLowerCase()];
        if (!template) {
          item.Result = _searchTagLoadError ?? `検索テンプレート [${key}] が見つかりません`;
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

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:GoogleRoute:Open',
    Description: 'Google Mapsで複数地点のルートを表示します',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text || !text.startsWith('[') || !text.endsWith(']')) {
          item.Result = 'カーソル位置のテキストがGoogleRouteタグではありません';
          return;
        }
        const inner = text.slice(1, -1);
        const colonIdx = inner.indexOf(':');
        if (colonIdx < 0) { item.Result = 'GoogleRouteタグの形式が正しくありません'; return; }
        const places = inner.slice(colonIdx + 1).split(',').map(p => p.trim()).filter(Boolean);
        if (places.length < 2) { item.Result = '経由地は2つ以上指定してください'; return; }
        const encoded = places.map(p => encodeURIComponent(p)).join('/');
        window.open(`https://www.google.com/maps/dir/${encoded}/`, '_blank');
        item.Result = `Google Mapsルート [${places.join(' → ')}] を開きました`;
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
        const text = getTextOnCursorSafe();
        if (!text || !text.startsWith('[') || !text.endsWith(']')) {
          item.Result = 'カーソル位置のテキストがYahooTransferタグではありません';
          return;
        }
        const inner = text.slice(1, -1);
        const colonIdx = inner.indexOf(':');
        if (colonIdx < 0) { item.Result = 'YahooTransferタグの形式が正しくありません'; return; }

        // パラメータは "key value" 形式をカンマ区切りで列挙する（例：from 東京駅,to 大阪駅,dep 10:00）
        const paramMap: Record<string, string> = {};
        inner.slice(colonIdx + 1).split(',').forEach(token => {
          const trimmed = token.trim();
          if (!trimmed) return;
          const spaceIdx = trimmed.indexOf(' ');
          if (spaceIdx < 0) return;
          const key = trimmed.slice(0, spaceIdx).trim().toLowerCase();
          const val = trimmed.slice(spaceIdx + 1).trim();
          if (['from', 'to', 'dep', 'arr', 'via'].includes(key) && val) {
            paramMap[key] = val;
          }
        });

        const { from = '', to = '', via = '', dep = '', arr = '' } = paramMap;
        if (!from || !to) { item.Result = 'YahooTransferタグには from と to が必要です'; return; }

        const params = new URLSearchParams();
        params.set('from', from);
        params.set('to', to);
        if (via) params.set('via', via);

        // dep（出発時刻）と arr（到着時刻）が両方指定された場合は dep を優先する
        const timeStr = dep || arr;
        if (timeStr) {
          const [hh = '0', mm = '0'] = timeStr.split(':');
          const now = new Date();
          params.set('y',  String(now.getFullYear()));
          params.set('m',  String(now.getMonth() + 1));
          params.set('d',  String(now.getDate()));
          params.set('hh', hh.padStart(2, '0'));
          const mmPad = mm.padStart(2, '0');
          params.set('m1', mmPad[0]);
          params.set('m2', mmPad[1]);
        }
        params.set('type', arr && !dep ? '4' : '1');

        window.open(`https://transit.yahoo.co.jp/search/result?${params.toString()}`, '_blank');
        item.Result = `Yahoo乗換案内 [${from} → ${to}] を開きました`;
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
        } else if (/^\d{4}-\d{2}-\d{2}-\d{6}$/.test(val)) {
          // [THINK:id] → ThinkをIDで直接開く
          app.OpenThinkInWorkout(val);
          item.Result = `Think [${val}] を開きました`;
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
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Mail:Open',
    Description: 'メールを開く、またはメール検索を行います（未実装）',
    Completion: (item) => {
      item.Result = '[Mail] アクションは未実装です';
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Chat:Open',
    Description: 'Thinktank>Think一覧でchatフィルター付きでキーワード検索します',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text || !text.startsWith('[') || !text.endsWith(']')) {
          item.Result = 'カーソル位置のテキストがChatタグではありません';
          return;
        }
        const inner = text.slice(1, -1);
        const colonIdx = inner.indexOf(':');
        const val = colonIdx >= 0 ? inner.slice(colonIdx + 1).trim() : '';
        app.ThinktankPanel.IsAreaOpen = true;
        app.ThinktankPanel.SetViewMode('filter');

        if (val.startsWith('>')) {
          const keywords = val.slice(1).trim();
          app.ThinktankPanel.SetContentFilter(keywords, ['chat']);
          item.Result = `Chatコンテンツ [${keywords}] で検索しました`;
        } else {
          app.ThinktankPanel.SetFilter(val, ['chat']);
          item.Result = `Chat [${val}] で検索しました`;
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:AI:Open',
    Description: '外部AI（Gemini/Claude/ChatGPT）へ接続します',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text || !text.startsWith('[') || !text.endsWith(']')) {
          item.Result = 'カーソル位置のテキストがAIタグではありません';
          return;
        }
        const inner = text.slice(1, -1);
        const colonIdx = inner.indexOf(':');

        let aiName = '';
        if (colonIdx >= 0) {
          const left = inner.slice(0, colonIdx).trim().toLowerCase();
          const right = inner.slice(colonIdx + 1).trim().toLowerCase();
          if (left === 'ai') {
            aiName = right === '>' ? 'gemini' : right;
          } else if (right === '>') {
            aiName = left;
          } else {
            aiName = left;
          }
        } else {
          aiName = inner.trim().toLowerCase();
        }

        // タグ以降の行テキストをsentenceとして取得
        let sentence = '';
        const editor = TTShortcutManager.instance.activeEditor;
        if (editor) {
          const pos = editor.getPosition();
          const model = editor.getModel();
          if (pos && model) {
            const lineContent = model.getLineContent(pos.lineNumber);
            const tagIdx = lineContent.indexOf(text);
            if (tagIdx >= 0) sentence = lineContent.slice(tagIdx + text.length).trim();
          }
        }

        let url: string;
        const q = sentence ? encodeURIComponent(sentence) : '';
        if (aiName === 'gemini') {
          url = q ? `https://gemini.google.com/app?q=${q}` : 'https://gemini.google.com/';
        } else if (aiName === 'claude') {
          url = q ? `https://claude.ai/new?q=${q}` : 'https://claude.ai/new';
        } else if (aiName === 'chatgpt' || aiName === 'gpt') {
          url = q ? `https://chatgpt.com/?q=${q}` : 'https://chatgpt.com/';
        } else {
          url = q ? `https://gemini.google.com/app?q=${q}` : 'https://gemini.google.com/';
        }
        window.open(url, '_blank');
        item.Result = `AI [${aiName || 'default'}] を開きました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Anchor:Open',
    Description: 'アンカーへ移動（[:>anchor]）、またはアンカーをHighlighterに設定（[:anchor]）します',
    Completion: (item) => {
      try {
        const text = getTextOnCursorSafe();
        if (!text || !text.startsWith('[') || !text.endsWith(']')) {
          item.Result = 'カーソル位置のテキストがAnchorタグではありません';
          return;
        }
        const inner = text.slice(1, -1); // e.g. ':>anchor' or ':anchor'
        if (inner.startsWith(':>')) {
          // 8.1 ジャンプ: [:>anchor] → [:anchor] で始まる行を探して移動
          const anchorName = inner.slice(2);
          const searchTag = `[:${anchorName}]`;
          const editor = TTShortcutManager.instance.activeEditor;
          if (!editor) { item.Result = 'エディタが見つかりません'; return; }
          const model = editor.getModel();
          if (!model) { item.Result = 'エディタモデルが見つかりません'; return; }
          const lineCount = model.getLineCount();
          for (let i = 1; i <= lineCount; i++) {
            if (model.getLineContent(i).trimStart().startsWith(searchTag)) {
              editor.setPosition({ lineNumber: i, column: 1 });
              editor.revealLineInCenter(i);
              item.Result = `アンカー [:${anchorName}] (行${i}) へ移動しました`;
              return;
            }
          }
          item.Result = `アンカー [:${anchorName}] が見つかりませんでした`;
        } else if (inner.startsWith(':')) {
          // 8.2 Highlighter設定: [:anchor]
          const anchorName = inner.slice(1);
          TTUIStateManager.instance.applyProperty('ToolBar.HighlighterMode.Text', anchorName);
          item.Result = `Highlighter を [${anchorName}] に設定しました`;
        } else {
          item.Result = 'Anchorタグの形式が正しくありません（例：[:anchor] または [:>anchor]）';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos',
    Description: 'カーソル位置がURL/パス/タグであれば対応するOpenアクションへ分岐実行する',
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
          const subTag = classifyTagSubTag(text);
          subActionId = `TextEditor.CurrentEditor.DoOnCursorPos:${subTag}:Open` as ActionID;
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
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
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
        };

        let prefix = '';
        let typeLabel = '';
        if (text.startsWith('http://') || text.startsWith('https://')) {
          prefix = prefixMap.url;
          typeLabel = 'URL アクション';
        } else if (text.startsWith('[') && text.endsWith(']')) {
          const subTag = classifyTagSubTag(text);
          prefix = `TextEditor.CurrentEditor.DoOnCursorPos:${subTag}:`;
          typeLabel = `タグ(${subTag}) アクション`;
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
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  // ── ThinkFileDrag（D&D）─────────────────────────────────────────────────
  // 疑似キー ThinkFileDrag / Alt+ThinkFileDrag（docs/Shortcut.md）の実行先。
  // ペイロード（ThinkID・配置先）は TTShortcutManager.setPendingThinkDrop() で
  // 事前にセットされ、consumePendingThinkDrop() で一度だけ読み取る。
  const contentTypeToMediaType = (contentType: string): import('../../types').MediaType => {
    switch (contentType) {
      case 'markdown': return 'markdown';
      case 'bundle':   return 'datagrid';
      case 'table':    return 'datagrid';
      case 'chat':     return 'chat';
      default:         return 'texteditor';
    }
  };

  TTActions.Register({
    ActionID: 'WorkoutPanel.DroppedFile.ID:Load',
    Description: 'ドロップされたThinkファイルをPaneにLoadする',
    Completion: (item) => {
      const ctx = TTShortcutManager.instance.consumePendingThinkDrop();
      if (!ctx) {
        item.Result = '[ドロップ情報なし]';
        return;
      }
      app.WorkoutPanel.DroppedFileID = ctx.thinkId;
      const think     = app.Models.Vault.GetThink(ctx.thinkId);
      const mediaType = think ? contentTypeToMediaType(think.ContentType) : 'texteditor';
      const title     = think?.Name ?? ctx.thinkId;

      if (ctx.kind === 'load-replace') {
        const area = app.WorkoutPanel.GetArea(ctx.areaId);
        if (!area) { item.Result = `[Pane未検出] ${ctx.areaId}`; return; }
        area.OpenThink(ctx.thinkId, mediaType, title);
        item.Result = `Load（差し替え）: ${title}`;
        return;
      }
      if (ctx.kind !== 'load-place') {
        item.Result = '[不正なドロップ情報]';
        return;
      }

      if (ctx.overlayType === 'add') {
        if (ctx.dir === 'left')       app.WorkoutPanel.AddToLeft(ctx.thinkId, mediaType, title);
        else if (ctx.dir === 'right') app.WorkoutPanel.AddToRight(ctx.thinkId, mediaType, title);
        else if (ctx.dir === 'up')    app.WorkoutPanel.AddToTop(ctx.thinkId, mediaType, title);
        else                          app.WorkoutPanel.AddToBottom(ctx.thinkId, mediaType, title);
      } else {
        if (ctx.areaId) app.WorkoutPanel.FocusArea(ctx.areaId);
        if (ctx.dir === 'left')       app.WorkoutPanel.AddLeft(ctx.thinkId, mediaType, title);
        else if (ctx.dir === 'right') app.WorkoutPanel.AddRight(ctx.thinkId, mediaType, title);
        else if (ctx.dir === 'up')    app.WorkoutPanel.AddAbove(ctx.thinkId, mediaType, title);
        else                          app.WorkoutPanel.AddBelow(ctx.thinkId, mediaType, title);
      }
      item.Result = `Load（新規Pane・${ctx.dir}）: ${title}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.DroppedFile.ID:Insert',
    Description: 'ドロップされたThinkファイルを [memo:{ID}] タグとしてコンテンツ内に挿入する',
    Completion: (item) => {
      const ctx = TTShortcutManager.instance.consumePendingThinkDrop();
      const editor = TTShortcutManager.instance.activeEditor;
      if (!ctx) { item.Result = '[ドロップ情報なし]'; return; }
      app.WorkoutPanel.DroppedFileID = ctx.thinkId;
      if (!editor) { item.Result = '[エディタ未選択]'; return; }
      const sel = editor.getSelection();
      const text = `[memo:${ctx.thinkId}]`;
      editor.executeEdits('think-drop', [{ range: sel, text, forceMoveMarkers: true }]);
      editor.focus();
      item.Result = `Insert: ${text}`;
    },
  });
}
