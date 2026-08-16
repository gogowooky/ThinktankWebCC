/**
 * media/types.ts
 * 全メディアコンポーネント共通の Props インターフェース。
 */

import type React from 'react';
import type { TTThink } from '../../../models/TTThink';
import type { TTVault } from '../../../models/TTVault';
import type { AiModelSelection } from '../../../services/aiModels';
import type { ColorStyle, InlineStyles, LinkStyles, MarkStyle } from '../../../utils/defaultColor';

export interface MediaProps {
  /**
   * このメディアが属するWorkoutAreaのID。WorkoutPanel.DroppedFile.ID:Insert がドロップ位置の
   * Paneからエディタインスタンスを引くための TTShortcutManager.registerAreaEditor() 登録キー
   * として使う（テキストエディタ系メディアのみ）。
   */
  areaId?:       string;
  /** 表示対象の Think（null = ResourceID 未設定）*/
  think:         TTThink | null;
  /** Vault 参照（DataGrid / Card / Graph が利用）*/
  vault:         TTVault;
  /**
   * Ctrl+S 等で保存要求が来たときに呼ばれる。content = 編集後の文字列。
   * thinkId は content の出所となった Think の ID。遅延保存（blur / デバウンス /
   * アンマウント）がペインの表示切替をまたいで発火しても、別ファイルへ書き込まないよう
   * 保存先を content の出所に固定するために必ず渡すこと。
   */
  onSave:        (content: string, thinkId?: string) => Promise<void>;
  /** エディタの変更状態が変わったときに呼ばれる */
  onDirtyChange: (dirty: boolean) => void;
  /** 第一行目（タイトル行）が変更されたときに呼ばれる */
  onTitleChange?: (title: string) => void;
  /** 外部からコンテンツが変更されたときにエディタを再マウントするためのカウンター */
  refreshKey?: number;
  /** ビュー切り替え時に TextEditorMedia が自動保存を実行するための関数を登録するRef */
  autoSaveRef?: React.MutableRefObject<(() => void) | null>;
  /**
   * AI Chat（ChatMedia）が使うホストモデル。WorkoutSettingArea の選択（panel単位）を
   * そのまま渡す。ChatMedia 側には選択用ドロップダウンを出さず、常にこれを使う。
   */
  aiChatModel?: AiModelSelection;
  /** TextEditor 用の設定 */
  editorSettings?: {
    lineNumbers: boolean;
    wordWrap: boolean;
    minimap: boolean;
    showFullWidthSpace: boolean;
    unicodeHighlight: boolean;
    bracketPairColorization: boolean;
    highlightWord: string;
    /** ハイライトグループ1..6の表示属性（TextEditor.Highlighter.StyleN.*） */
    highlightStyles: ColorStyle[];
    background: string;
    foreground: string;
    selectionBackground: string;
    occurrenceBackground: string;
    /** 見出しレベル1..6の表示属性（TextEditor.Heading.StyleN.*） */
    headingStyles: ColorStyle[];
    /** 行頭記号（TextEditor.<種別>.Marks）と色・表示属性（TextEditor.<種別>.StyleN.*）の組 */
    commentStyles?: MarkStyle[];
    bulletStyles?:  MarkStyle[];
    /** カーソル位置判定の対象になる Url / Filepath / Tag の表示属性 */
    linkStyles?: LinkStyles;
    /** `**bold**` / `*italic*` / `__underline__` / `~~strikethrough~~` の表示属性 */
    inlineStyles?: InlineStyles;
  };
}
