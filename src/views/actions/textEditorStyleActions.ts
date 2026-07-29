/**
 * textEditorStyleActions.ts
 * TextEditor.Bullet.* / TextEditor.Comment.* アクション（行頭の箇条書き記号・コメント記号を
 * 設定済みスタイル一覧内で順送り/逆送りに切り替える）の登録。
 *
 * 元は views/TTFocusedPanelActions.ts に registerTextEditorBulletActions /
 * registerTextEditorCommentActions として個別に実装されていたが、両者はロジックが
 * ほぼ同一（違いは設定の参照先とインデント扱いのみ）だったため、共通実装
 * registerStylePrefixActions に統合した。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { getErrorMessage } from '../../utils/errorMessage';

interface StylePrefixConfig {
  actionPrefix: 'Bullet' | 'Comment';
  /** エラー/結果メッセージに使う短い名称（例: "バレット" / "コメント"） */
  shortLabel: string;
  /** アクションDescriptionに使う名称（例: "箇条書き文字" / "コメント記号"） */
  descLabel: string;
  /** true: 行頭インデントを保持したまま記号だけ切り替える（Bullet用） */
  respectIndent: boolean;
  getStyleNum: (app: TTApplication) => number | undefined;
  getRawStyle: (app: TTApplication, i: number) => string;
}

function registerStylePrefixActions(app: TTApplication, cfg: StylePrefixConfig): void {
  const getStyles = (): string[] => {
    const styles: string[] = [];
    const num = cfg.getStyleNum(app) ?? 0;
    for (let i = 1; i <= num; i++) {
      const val = cfg.getRawStyle(app, i) || '';
      const parts = val.split(',');
      const symbol = (parts[0] || '').trim();
      if (symbol) {
        const formatSymbol = symbol.endsWith(' ') ? symbol : symbol + ' ';
        styles.push(formatSymbol);
      }
    }
    styles.push('');
    return styles;
  };

  const toggleStyle = (item: any, direction: 'next' | 'prev') => {
    try {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) { item.Result = '[エディタ未選択]'; return; }
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) { item.Result = '[モデル/選択なし]'; return; }

      const styles = getStyles();
      if (styles.length === 0) { item.Result = `[${cfg.shortLabel}設定空]`; return; }

      // 各スタイルを文字列の長さ順に降順ソート（ただし空文字列はstartsWithでマッチさせるため除外）
      const sortedStyles = styles.filter(s => s !== '').sort((a, b) => b.length - a.length);

      const startLine = selection.startLineNumber;
      const endLine = selection.endLineNumber;
      const edits: any[] = [];

      for (let line = startLine; line <= endLine; line++) {
        const lineContent = model.getLineContent(line);
        const indent = cfg.respectIndent ? (lineContent.match(/^([ \t]*)/)?.[1] ?? '') : '';
        const content = cfg.respectIndent ? lineContent.slice(indent.length) : lineContent;

        // スタイル一覧のいずれかで始まっているか確認
        let matchedStyle: string | null = null;
        for (const s of sortedStyles) {
          if (content.startsWith(s)) {
            matchedStyle = s;
            break;
          }
        }

        let newText = '';
        if (matchedStyle !== null) {
          // すでにスタイルがある場合：切り替え
          const originalIdx = styles.indexOf(matchedStyle);
          const idx = originalIdx >= 0 ? originalIdx : 0;
          const nextIdx = direction === 'next'
            ? (idx + 1) % styles.length
            : (idx - 1 + styles.length) % styles.length;
          newText = indent + styles[nextIdx] + content.slice(matchedStyle.length);
        } else {
          // スタイルがない場合（blank状態）：blankのインデックス(空文字列)をベースに遷移
          const blankIdx = styles.indexOf('');
          const idx = blankIdx >= 0 ? blankIdx : styles.length - 1;
          const nextIdx = direction === 'next'
            ? (idx + 1) % styles.length
            : (idx - 1 + styles.length) % styles.length;
          newText = indent + styles[nextIdx] + content;
        }

        edits.push({
          range: new (window as any).monaco.Range(line, 1, line, lineContent.length + 1),
          text: newText,
          forceMoveMarkers: false
        });
      }

      if (edits.length > 0) {
        editor.executeEdits(`toggle${cfg.actionPrefix}Style`, edits);
        item.Result = `${cfg.shortLabel}切替 (${direction}): ${startLine}-${endLine}行`;
      }
    } catch (err) {
      item.Result = `[エラー] ${getErrorMessage(err)}`;
    }
  };

  TTActions.Register({
    ActionID: `TextEditor.${cfg.actionPrefix}.NextStyle`,
    Description: `行頭の${cfg.descLabel}を次のスタイルに変更する`,
    Completion: (item) => {
      toggleStyle(item, 'next');
    }
  });

  TTActions.Register({
    ActionID: `TextEditor.${cfg.actionPrefix}.PrevStyle`,
    Description: `行頭の${cfg.descLabel}を前のスタイルに変更する`,
    Completion: (item) => {
      toggleStyle(item, 'prev');
    }
  });
}

export function registerTextEditorBulletActions(app: TTApplication): void {
  registerStylePrefixActions(app, {
    actionPrefix: 'Bullet',
    shortLabel: 'バレット',
    descLabel: '箇条書き文字',
    respectIndent: true,
    getStyleNum: (a) => a.WorkoutPanel.TextEditor.Bullet.StyleNum,
    getRawStyle: (a, i) => (a.WorkoutPanel.TextEditor.Bullet as any)[`Style${i}`],
  });
}

export function registerTextEditorCommentActions(app: TTApplication): void {
  registerStylePrefixActions(app, {
    actionPrefix: 'Comment',
    shortLabel: 'コメント',
    descLabel: 'コメント記号',
    respectIndent: false,
    getStyleNum: (a) => a.WorkoutPanel.TextEditor.Comment.StyleNum,
    getRawStyle: (a, i) => (a.WorkoutPanel.TextEditor.Comment as any)[`Style${i}`],
  });
}
