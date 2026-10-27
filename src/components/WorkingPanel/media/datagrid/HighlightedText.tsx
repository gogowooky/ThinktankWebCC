import type { MediaProps } from '../types';
import { colorStyleToInlineStyle, styleClass } from '../../../../utils/defaultColor';
import {
  buildRegexFromWords,
  splitHighlighterGroups,
  splitHighlighterWords,
} from '../../../../utils/highlighterPattern';

export function HighlightedText({ text, editorSettings }: { text: string; editorSettings?: MediaProps['editorSettings']; }) {
  if (!editorSettings?.highlightWord) return <>{text}</>;

  const hlOptions = {
    matchCase: editorSettings.highlightMatchCase,
    isRegex: editorSettings.highlightIsRegex,
    matchWidth: editorSettings.highlightMatchWidth,
  };

  const groups = splitHighlighterGroups(editorSettings.highlightWord);
  let segments: { text: string; groupIdx?: number; }[] = [{ text }];

  groups.forEach((groupStr, groupIdx) => {
    const words = splitHighlighterWords(groupStr);
    if (words.length === 0) return;

    const regex = buildRegexFromWords(words, hlOptions, true);
    if (!regex) return;

    const nextSegments: { text: string; groupIdx?: number; }[] = [];
    segments.forEach(seg => {
      if (seg.groupIdx !== undefined) {
        nextSegments.push(seg);
        return;
      }
      const parts = seg.text.split(regex);
      parts.forEach((part, i) => {
        if (!part) return;
        if (i % 2 === 1) {
          nextSegments.push({ text: part, groupIdx });
        } else {
          nextSegments.push({ text: part });
        }
      });
    });
    segments = nextSegments;
  });

  return (
    <>
      {segments.map((seg, i) => (
        seg.groupIdx !== undefined ? (
          <span
            key={i}
            className={`datagrid-highlight ${styleClass('Highlighter', seg.groupIdx + 1)}`}
            style={colorStyleToInlineStyle(editorSettings.highlightStyles[seg.groupIdx])}
          >
            {seg.text}
          </span>
        ) : (
          seg.text
        )
      ))}
    </>
  );
}
