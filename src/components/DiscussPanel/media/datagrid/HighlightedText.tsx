import type { MediaProps } from '../types';
import { colorStyleToInlineStyle, styleClass } from '../../../../utils/defaultColor';

export function HighlightedText({ text, editorSettings }: { text: string; editorSettings?: MediaProps['editorSettings']; }) {
  if (!editorSettings?.highlightWord) return <>{text}</>;

  const groups = editorSettings.highlightWord.split(',').slice(0, 5);
  let segments: { text: string; groupIdx?: number; }[] = [{ text }];

  groups.forEach((groupStr, groupIdx) => {
    const words = groupStr.split(' ').map(w => w.trim()).filter(w => w.length > 0);
    if (words.length === 0) return;

    const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedWords.join('|')})`, 'g');

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
