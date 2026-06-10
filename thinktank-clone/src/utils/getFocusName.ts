// フォーカス要素から focusable 属性名を特定する

/** 祖先方向に data-focusable 属性を探索してフォーカス名を返す */
export function getFocusName(el: Element | null): string {
  let cur: Element | null = el;
  while (cur) {
    const name = cur.getAttribute?.('data-focusable');
    if (name) return name;
    cur = cur.parentElement;
  }
  return '';
}

/** 入力系要素か（グローバルショートカット抑止判定用） */
export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  // Monaco Editor 内部の textarea
  if (el.closest?.('.monaco-editor')) return true;
  return false;
}
