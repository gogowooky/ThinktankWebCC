/**
 * diffUtils.ts
 * 履歴スナップショット（日記形式など）の追記部分（差分）を検出するユーティリティ。
 */

/**
 * 以前のテキスト(prev)と最新のテキスト(curr)を比較し、
 * 新しく追加された部分（差分テキスト）を抽出して返します。
 * 日記形式などの追記検出に対応します。
 */
export function getAddedText(prev: string, curr: string): string {
  const normalizedPrev = prev.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normalizedCurr = curr.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (normalizedPrev === normalizedCurr) return '';

  const prevLines = normalizedPrev.split('\n').map(l => l.trim());
  const currLines = normalizedCurr.split('\n');

  // 1. 行ベースでの追加検知（前文に含まれなかった行を抽出）
  const addedLines = currLines.filter(line => !prevLines.includes(line.trim()));
  const addedText = addedLines.join('\n').trim();

  if (addedText.length > 0) {
    return addedText;
  }

  // 2. 日記のように末尾に追記された場合のフォールバック（日付ヘッダーベース）
  // 例: 「## 2026-05-26」や「## 2026/05/26」などのヘッダーを後ろからスキャン
  const dateSectionRegex = /^##\s*(\d{4}[-/]\d{2}[-/]\d{2})/gm;
  let match;
  let lastIndex = -1;

  while ((match = dateSectionRegex.exec(normalizedCurr)) !== null) {
    lastIndex = match.index;
  }

  if (lastIndex !== -1) {
    const sectionText = normalizedCurr.slice(lastIndex).trim();
    // 前回の本文に含まれていなければ、そのセクションごと新規追加とみなす
    if (!normalizedPrev.includes(sectionText)) {
      return sectionText;
    }
  }

  // 3. 差分が特定できない場合の最終フォールバック（最新テキストの末尾部分を返す）
  return normalizedCurr.slice(-150).trim();
}
