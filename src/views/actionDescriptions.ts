/**
 * actionDescriptions.ts
 * docs/Thinktank_Status-Action-Binding.md の各 Action 節の description を、Action の説明として使う。
 *
 * Action 節は `## Action[ 実装/修正/調査/完了]：　日付　ActionID` の見出しで始まり、ActionID は見出しの最後の語。
 * 節内の最初の `description:` 行がその Action の説明になる（TTActions.Register でコード側の値より優先する）。
 */
import bindingContent from '../../docs/Thinktank_Status-Action-Binding.md?raw';

/** Thinktank_Status-Action-Binding.md 形式のテキストから ActionID → description を取り出す */
export function parseActionDescriptions(text: string): Map<string, string> {
  const result = new Map<string, string>();
  let currentId: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#{1,3} /.test(line)) {
      currentId = /^## Action/.test(line) ? line.split(/[\s　]+/).pop() ?? null : null;
      continue;
    }
    if (!currentId || result.has(currentId)) continue;
    const m = line.match(/^description\s*[:：]\s*(.*)$/i);
    if (m && m[1].trim()) result.set(currentId, m[1].trim());
  }
  return result;
}

const DOC_DESCRIPTIONS = parseActionDescriptions(bindingContent);

/** ActionID の説明（docs/Thinktank_Status-Action-Binding.md に記載があればその値） */
export function actionDescriptionFromDoc(actionId: string): string | undefined {
  return DOC_DESCRIPTIONS.get(actionId);
}
