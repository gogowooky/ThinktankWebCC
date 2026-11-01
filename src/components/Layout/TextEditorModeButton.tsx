/**
 * TextEditorModeButton.tsx
 * サブパネルのリボン右端に置く表示形式アイコン（TextEditor のみ）。
 * Pane の TextEditor アイコンと同じく、Shift+クリックで YAML＋本文 表示、クリックで通常表示にする。
 */

import { NotebookPen } from 'lucide-react';
import './MenuRibbon.css';

interface Props {
  rawYaml: boolean;
  onChange: (rawYaml: boolean) => void;
  readOnly?: boolean;
}

export function TextEditorModeButton({ rawYaml, onChange, readOnly = false }: Props) {
  return (
    <button
      className={`menu-ribbon__btn menu-ribbon__btn--icon menu-ribbon__btn--active${rawYaml ? ' menu-ribbon__btn--raw' : ''}`}
      onClick={e => onChange(e.shiftKey)}
      data-tip={readOnly
        ? 'テキストエディタ（読み取り専用、Shift+クリック: YAML込みで表示）'
        : 'テキストエディタ（Shift+クリック: YAML込みで表示・保存）'}
      data-tip-side="left"
      aria-label="テキストエディタ"
      aria-pressed="true"
    >
      <NotebookPen size={14} />
    </button>
  );
}
