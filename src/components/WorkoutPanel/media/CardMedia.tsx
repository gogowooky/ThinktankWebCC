/**
 * CardMedia.tsx
 * カード形式一覧メディア。
 *
 * - 2列グリッドでカードを表示
 * - think が Thought → 参照 Think 一覧
 * - それ以外 → Vault の全 Think（thought 除く）
 * - タイトル・ContentType アイコン・抜粋・更新日を表示
 */

import { useState, useMemo } from 'react';
import {
  FileText, Lightbulb, Table, Link, MessageCircle, Globe,
  type LucideIcon,
} from 'lucide-react';
import type { TTThink } from '../../../models/TTThink';
import type { ContentType } from '../../../types';
import type { MediaProps } from './types';
import './CardMedia.css';

const CONTENT_ICONS: Record<ContentType, LucideIcon> = {
  memo:    FileText,
  thought: Lightbulb,
  tables:  Table,
  links:   Link,
  chat:    MessageCircle,
  nettext: Globe,
};

const CONTENT_COLORS: Record<ContentType, string> = {
  memo:    '#3b78c4',
  thought: '#c9a227',
  tables:  '#2e7d32',
  links:   '#7b1fa2',
  chat:    '#d32f2f',
  nettext: '#00838f',
};

function excerpt(content: string, maxLen = 90): string {
  const text = content
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function formatDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : dateStr.slice(0, 10);
}

export function CardMedia({ think, vault }: MediaProps) {
  const [filter, setFilter] = useState('');

  const allItems = useMemo<TTThink[]>(() => {
    if (think?.ContentType === 'thought') {
      return vault.GetThinksForThought(think.ID);
    }
    return vault.GetThinks().filter(t => t.ContentType !== 'thought');
  }, [think, vault]);

  const filtered = useMemo<TTThink[]>(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(t =>
      t.Name.toLowerCase().includes(q) ||
      t.Keywords.toLowerCase().includes(q)
    );
  }, [allItems, filter]);

  return (
    <div className="card-media">

      {/* フィルター */}
      <div className="card-media__toolbar">
        <input
          className="card-media__filter"
          type="text"
          placeholder="タイトル・キーワードで絞り込み…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <span className="card-media__count">{filtered.length} 件</span>
      </div>

      {/* カードグリッド */}
      <div className="card-media__grid">
        {filtered.map(item => {
          const Icon  = CONTENT_ICONS[item.ContentType] ?? FileText;
          const color = CONTENT_COLORS[item.ContentType] ?? '#666';
          const isFocus = think?.ID === item.ID;

          return (
            <div
              key={item.ID}
              className={['card-media__card', isFocus ? 'card-media__card--focus' : ''].join(' ')}
            >
              {/* カードヘッダー */}
              <div className="card-media__card-header" style={{ borderTopColor: color }}>
                <span className="card-media__card-icon" style={{ color }}>
                  <Icon size={13} />
                </span>
                <span className="card-media__card-title" title={item.Name}>
                  {item.Name}
                </span>
              </div>

              {/* 抜粋 */}
              <div className="card-media__card-body">
                {excerpt(item.Content)}
              </div>

              {/* フッター */}
              <div className="card-media__card-footer">
                <span>{formatDate(item.UpdateDate)}</span>
                {item.Keywords && (
                  <span className="card-media__card-keywords">
                    {item.Keywords.split(',').slice(0, 2).map(k => k.trim()).filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="card-media__empty">
            {filter ? '一致するアイテムはありません' : 'データがありません'}
          </div>
        )}
      </div>
    </div>
  );
}
