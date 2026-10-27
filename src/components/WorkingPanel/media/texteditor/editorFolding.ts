
import type { editor as MonacoEditor } from 'monaco-editor';
interface FoldingRegions { length: number; isCollapsed(index: number): boolean; getStartLineNumber(index: number): number; }
export function getCollapsedStartLines(editor: Pick<MonacoEditor.IStandaloneCodeEditor, 'getContribution'>): number[] {
  const regions = (editor.getContribution?.('editor.contrib.folding') as unknown as { foldingModel?: { regions?: FoldingRegions; }; } | null)
    ?.foldingModel?.regions;
  if (!regions) return [];

  const closed: number[] = [];
  for (let i = 0;i < regions.length;i++) {
    if (regions.isCollapsed(i)) {
      closed.push(regions.getStartLineNumber(i));
    }
  }
  return closed;
}

export function getClosedHeadings(editor: Pick<MonacoEditor.IStandaloneCodeEditor, 'getContribution'>): string {
  return getCollapsedStartLines(editor).join(',');
}
