/**
 * useEditorSettings.ts
 * WorkingPanel の TextEditor 設定（表示・色）を MediaProps.editorSettings の形にまとめる。
 * Working のペインと各パネルの「プロジェクト」サブパネルで同じ見た目にするため共有する。
 */

import { useMemo } from 'react';
import type { TTWorkingPanel } from '../../../views/TTWorkingPanel';
import { FOLDING_HEADER_STATUS_ID, isUnset, pickColorStyle, pickIndexedStyles, pickInlineStyles, pickLinkStyles, pickMarkStyles } from '../../../utils/defaultColor';
import type { MediaProps } from './types';

export function useEditorSettings(panel: TTWorkingPanel): NonNullable<MediaProps['editorSettings']> {
  return useMemo(() => {
    // Bullet / Comment は行頭記号（TextEditor.<種別>.Marks）と色・属性（DefaultColor.md）を突き合わせる
    const bulletStyles  = pickMarkStyles('Bullet',  panel?.TextEditor.Bullet.Marks,  panel?.TextEditor.ColorStatus);
    const commentStyles = pickMarkStyles('Comment', panel?.TextEditor.Comment.Marks, panel?.TextEditor.ColorStatus);

    // エディタの基本色。Monaco のテーマには必ず値を渡す必要があるため、
    // DefaultColor.md 側が無設定のときだけ最終フォールバックを当てる。
    const textStyle       = pickColorStyle('TextEditor.Text',       panel?.TextEditor.ColorStatus);
    const selectionStyle  = pickColorStyle('TextEditor.Selection.Theme',  panel?.TextEditor.ColorStatus);
    const occurrenceStyle = pickColorStyle('TextEditor.Occurrence.Theme', panel?.TextEditor.ColorStatus);
    const colorOr = (value: string, fallback: string) => (isUnset(value) ? fallback : value);

    return {
      lineNumbers:   panel?.TextEditor.LineNumbers.IsVisible ?? false,
      wordWrap:      panel?.TextEditor.WordWrap.IsVisible ?? true,
      minimap:       panel?.TextEditor.Minimap.IsVisible ?? false,
      showFullWidthSpace: panel?.TextEditor.FullWidthSpace.IsVisible ?? false,
      unicodeHighlight: panel?.TextEditor.UnicodeHighlight.IsVisible ?? false,
      bracketPairColorization: panel?.TextEditor.BracketPairColorization.IsVisible ?? true,
      highlightWord: panel?.HighlightWord ?? '',
      highlightMatchCase: panel?.HighlightMatchCase ?? false,
      highlightIsRegex: panel?.HighlightIsRegex ?? false,
      highlightMatchWidth: panel?.HighlightMatchWidth ?? false,
      highlightStyles: pickIndexedStyles('Highlighter', panel?.TextEditor.ColorStatus),
      background:           colorOr(textStyle.BgColor,       '#f5f5f5'),
      foreground:           colorOr(textStyle.Color,         '#1e1e1e'),
      selectionBackground:  colorOr(selectionStyle.Color,  '#cba8ff'),
      occurrenceBackground: colorOr(occurrenceStyle.Color, '#ccffdd'),
      headingStyles:   pickIndexedStyles('Heading',     panel?.TextEditor.ColorStatus),
      commentStyles,
      bulletStyles,
      linkStyles:          pickLinkStyles(panel?.TextEditor.ColorStatus),
      inlineStyles:        pickInlineStyles(panel?.TextEditor.ColorStatus),
      foldingHeaderStyle:  pickColorStyle(FOLDING_HEADER_STATUS_ID, panel?.TextEditor.ColorStatus),
    };
  }, [panel?.TextEditor.LineNumbers.IsVisible, panel?.TextEditor.WordWrap.IsVisible, panel?.TextEditor.Minimap.IsVisible,
       panel?.TextEditor.FullWidthSpace.IsVisible, panel?.TextEditor.UnicodeHighlight.IsVisible,
       panel?.TextEditor.BracketPairColorization.IsVisible, panel?.HighlightWord, panel?.HighlightMatchCase, panel?.HighlightIsRegex, panel?.HighlightMatchWidth,
       panel?.TextEditor.ColorStatus,
       panel?.TextEditor.Bullet.Marks, panel?.TextEditor.Comment.Marks]);
}
