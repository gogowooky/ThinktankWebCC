/**
 * Monaco は自分の入力欄の focus / blur イベントだけでフォーカスの有無を記録する。
 * ウィンドウ切替などで blur だけ届いて focus が来ないと、入力欄に実際のフォーカスがあっても
 * 「どのエディタにもフォーカスがない」と記録されたままになる。その間、文字入力（IME 確定を含む）は
 * フォーカス中のエディタを探す `type` 系コマンドが行き先を失って捨てられ、別経路の Backspace だけが効く。
 * 入力欄内でキーが押されたら記録とのずれを確かめ、ずれていれば editor.focus() で記録を揃え直す。
 * keydown は IME の compositionstart より先に来るので、変換の最初の1文字から正しく入る。
 */

export interface TextFocusEditor {
  getDomNode(): HTMLElement | null;
  hasTextFocus(): boolean;
  focus(): void;
}

/** Monaco が文字入力を受ける隠しテキストエリアのクラス名（検索ウィジェット等の入力欄と区別する） */
const MONACO_INPUT_CLASS = 'inputarea';

export function installTextFocusResync(editor: TextFocusEditor): { dispose: () => void } {
  const node = editor.getDomNode();
  if (!node) return { dispose: () => {} };

  const onKeyDown = () => {
    const active = node.ownerDocument.activeElement;
    if (!(active instanceof HTMLTextAreaElement)) return;
    if (!active.classList.contains(MONACO_INPUT_CLASS) || !node.contains(active)) return;
    if (editor.hasTextFocus()) return;
    editor.focus();
  };

  node.addEventListener('keydown', onKeyDown, true);
  return { dispose: () => node.removeEventListener('keydown', onKeyDown, true) };
}
