// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { HighlightedText } from './HighlightedText';

describe('HighlightedText', () => {
  const defaultStyles = [{ Color: '#000000', BgColor: '#ffff00', Attrs: '' }];

  it('highlights text ignoring case and width by default', () => {
    const html = renderToStaticMarkup(
      <HighlightedText
        text="abc ＡＢＣ 123"
        editorSettings={{
          lineNumbers: true, wordWrap: true, minimap: true, showFullWidthSpace: false,
          unicodeHighlight: false, bracketPairColorization: true,
          highlightWord: 'abc', highlightStyles: defaultStyles, headingStyles: [],
          background: '', foreground: '', selectionBackground: '', occurrenceBackground: '',
          highlightMatchCase: false, highlightMatchWidth: false, highlightIsRegex: false,
        }}
      />
    );
    expect(html).toContain('<span class="datagrid-highlight custom-highlight-g1"');
    expect(html).toContain('>abc</span>');
    expect(html).toContain('>ＡＢＣ</span>');
  });

  it('respects matchCase: true', () => {
    const html = renderToStaticMarkup(
      <HighlightedText
        text="abc ＡＢＣ"
        editorSettings={{
          lineNumbers: true, wordWrap: true, minimap: true, showFullWidthSpace: false,
          unicodeHighlight: false, bracketPairColorization: true,
          highlightWord: 'abc', highlightStyles: defaultStyles, headingStyles: [],
          background: '', foreground: '', selectionBackground: '', occurrenceBackground: '',
          highlightMatchCase: true, highlightMatchWidth: false, highlightIsRegex: false,
        }}
      />
    );
    expect(html).toContain('>abc</span>');
    expect(html).not.toContain('>ＡＢＣ</span>');
  });
});
