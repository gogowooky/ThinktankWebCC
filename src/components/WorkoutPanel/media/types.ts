/**
 * media/types.ts
 * 全メディアコンポーネント共通の Props インターフェース。
 */

import type { TTThink } from '../../../models/TTThink';
import type { TTVault } from '../../../models/TTVault';

export interface MediaProps {
  /** 表示対象の Think（null = ResourceID 未設定）*/
  think:         TTThink | null;
  /** Vault 参照（DataGrid / Card / Graph が利用）*/
  vault:         TTVault;
  /** Ctrl+S 等で保存要求が来たときに呼ばれる。content = 編集後の文字列 */
  onSave:        (content: string) => void;
  /** エディタの変更状態が変わったときに呼ばれる */
  onDirtyChange: (dirty: boolean) => void;
  /** TextEditor 用の設定 */
  editorSettings?: {
    lineNumbers: boolean;
    wordWrap: boolean;
    minimap: boolean;
    showFullWidthSpace: boolean;
    unicodeHighlight: boolean;
    bracketPairColorization: boolean;
    highlightWord: string;
    highlightStyles: { backgroundColor: string; color: string }[];
    background: string;
    foreground: string;
    headingStyles: { color: string; bold: boolean; underline: boolean }[];
  };
}
