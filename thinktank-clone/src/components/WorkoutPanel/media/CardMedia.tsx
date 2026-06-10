// かんばん風カードメディア：見出し（##）単位、thought の場合は含有Think単位

import { useMemo } from 'react';
import { marked } from 'marked';
import type { TTThink } from '../../../models/TTThink';
import { app } from '../../../views/TTApplication';
import { useNotify } from '../../../hooks/useNotify';
import './CardMedia.css';

interface Card {
  title: string;
  body: string;
  thinkId?: string;
}

export function CardMedia({ think }: { think: TTThink }) {
  useNotify(think, app.Vault);

  const cards = useMemo<Card[]>(() => {
    if (think.ContentType === 'thought') {
      return app.Vault.FilterByThought(think).map((t) => ({
        title: t.Name || '(無題)',
        body: t.ContentLoaded ? t.Content.split('\n').slice(1, 8).join('\n') : `(${t.ContentType})`,
        thinkId: t.ID,
      }));
    }
    // 見出し（##以下）単位でカード化
    const lines = think.Content.split('\n');
    const result: Card[] = [];
    let current: Card | null = null;
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(/^#{2,}\s+(.*)$/);
      if (m) {
        if (current) result.push(current);
        current = { title: m[1], body: '' };
      } else if (current) {
        current.body += lines[i] + '\n';
      }
    }
    if (current) result.push(current);
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [think.Content, app.Vault.UpdateDate]);

  return (
    <div className="card-media">
      {cards.map((c, i) => (
        <div
          key={c.thinkId ?? i}
          className="card-media__card"
          onDoubleClick={() => c.thinkId && void app.OpenThink(c.thinkId)}
        >
          <div className="card-media__card-title">{c.title}</div>
          <div
            className="card-media__card-body"
            dangerouslySetInnerHTML={{ __html: marked.parse(c.body.trim()) as string }}
          />
        </div>
      ))}
      {cards.length === 0 && <div className="card-media__empty">カードがありません（## 見出しで区切ってください）</div>}
    </div>
  );
}
