/**
 * cursorTagOpenActions.ts
 * Chat・AI・Anchor タグを開くアクションと、カーソル位置の種別に応じて :Open へ振り分ける
 * TextEditor.CurrentEditor.DoOnCursorPos。
 *
 * registerTextEditorCursorContentActions（textEditorCursorContentActions.ts）から順に呼ばれる。
 */
import type { TTApplication } from '../TTApplication';
import type { ActionID } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { TTUIStateManager } from '../TTUIStateManager';
import { getErrorMessage } from '../../utils/errorMessage';
import { UNAVAILABLE_ACTIONS } from '../unavailableActions';
import { cursorContentHelpers, classifyTagSubTag } from './cursorContentHelpers';

export function registerCursorTagOpenActions(app: TTApplication): void {
  const { getTextOnCursorSafe } = cursorContentHelpers(app);

  TTActions.Register(UNAVAILABLE_ACTIONS.mail);

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
}
