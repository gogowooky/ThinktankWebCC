// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { MediaProps } from '../types';
import { applyEditorDecorations } from './editorDecorations';
import { getCollapsedStartLines, getClosedHeadings } from './editorFolding';
import { inlineStyleClass, linkStyleClass, styleClass } from '../../../../utils/defaultColor';

const oldMonaco = window.monaco;
afterEach(() => { window.monaco = oldMonaco; document.getElementById('text-editor-highlight-styles')?.remove(); });

it('preserves heading, bullet, full-width space, word, link and inline decorations', () => {
  class Range {
    constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {}
  }
  window.monaco = { Range } as unknown as typeof import('monaco-editor');
  const lines = ['# Heading', '* bullet', 'https://example.test **bold**　needle [tag]'];
  const editor = { getModel: () => ({ getLineCount: () => lines.length, getLineContent: (line: number) => lines[line - 1] }) } as unknown as MonacoEditor.IStandaloneCodeEditor;
  const set = vi.fn<(decorations: MonacoEditor.IModelDeltaDecoration[]) => void>();
  const collection = { set } as unknown as MonacoEditor.IEditorDecorationsCollection;
  const style = { Color: '#123456', BgColor: 'none', Attrs: 'bold' };
  const settings: NonNullable<MediaProps['editorSettings']> = {
    lineNumbers: true, wordWrap: true, minimap: true, showFullWidthSpace: true, unicodeHighlight: false,
    bracketPairColorization: true, highlightWord: 'needle', highlightStyles: [style], headingStyles: [style],
    background: '#ffffff', foreground: '#123456', selectionBackground: '#dddddd', occurrenceBackground: '#eeeeee',
    bulletStyles: [{ mark: '*', style }],
  };
  applyEditorDecorations(editor, collection, settings);
  const decorations = set.mock.calls[0][0];
  const classes = decorations.map(decoration => decoration.options.inlineClassName);
  expect(classes).toEqual(expect.arrayContaining([
    styleClass('Heading', 1), styleClass('Bullet', 1), styleClass('Highlighter', 1),
    'full-width-space-decoration', linkStyleClass('url'), linkStyleClass('tag'), inlineStyleClass('bold'),
  ]));
  expect(decorations.find(decoration => decoration.options.inlineClassName === styleClass('Heading', 1))?.range)
    .toMatchObject({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 });
  expect(document.getElementById('text-editor-highlight-styles')?.textContent).toContain('#123456');
});

it('keeps closed-heading line numbers and handles an unavailable folding contribution', () => {
  const editor = { getContribution: () => ({ foldingModel: { regions: {
    length: 3, isCollapsed: (index: number) => index !== 1, getStartLineNumber: (index: number) => index * 4 + 1,
  } } }) } as unknown as MonacoEditor.IStandaloneCodeEditor;
  expect(getCollapsedStartLines(editor)).toEqual([1, 9]);
  expect(getClosedHeadings(editor)).toBe('1,9');
  const missing = { getContribution: () => null } as unknown as MonacoEditor.IStandaloneCodeEditor;
  expect(getClosedHeadings(missing)).toBe('');
});
