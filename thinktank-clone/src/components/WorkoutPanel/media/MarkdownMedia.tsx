// Markdown プレビューメディア

import { marked } from 'marked';
import type { TTThink } from '../../../models/TTThink';
import { useNotify } from '../../../hooks/useNotify';
import './MarkdownMedia.css';

export function MarkdownMedia({ think }: { think: TTThink }) {
  useNotify(think);
  return (
    <div
      className="markdown-media"
      dangerouslySetInnerHTML={{ __html: marked.parse(think.Content) as string }}
    />
  );
}
