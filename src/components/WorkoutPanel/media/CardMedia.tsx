/**
 * CardMedia.tsx
 * カード形式一覧メディア。
 *
 * - think.ContentType === 'table' → TableCardView（1行1カード、col:val形式）
 * - think が Thought → 参照 Think 一覧カード
 * - それ以外 → Vault の全 Think（thought 除く）カード
 */

import { useState, useMemo } from 'react';
import {
  FileText, Lightbulb, Table, Link, MessageCircle, Globe,
  type LucideIcon,
} from 'lucide-react';
import type { TTThink } from '../../../models/TTThink';
import type { ContentType } from '../../../types';
import type { MediaProps } from './types';
import { parseTableContent } from '../../../utils/tableFormat';
import './CardMedia.css';

const CONTENT_ICONS: Record<ContentType, LucideIcon> = {
  memo:    FileText,
  thought: Lightbulb,
  table:   Table,
  links:   Link,
  chat:    MessageCircle,
  nettext: Globe,
};

const CONTENT_COLORS: Record<ContentType, string> = {
  memo:    '#3b78c4',
  thought: '#c9a227',
  table:   '#2e7d32',
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

// ── TableCardView ─────────────────────────────────────────────────────────────

function TableCardView({ think }: { think: TTThink }) {
  const [filter, setFilter] = useState('');

  const sections = useMemo(() => parseTableContent(think.Content), [think.Content]);
  const section  = sections[0] ?? null;

  const filteredRows = useMemo<string[][]>(() => {
    if (!section) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return section.rows;
    return section.rows.filter(row =>
      row.some(cell => cell.toLowerCase().includes(q))
    );
  }, [section, filter]);

  if (!section) {
    return (
      <div className="card-media">
        <div className="card-media__empty-full">
          テーブルデータがありません。TextEditor で列定義（&gt; 列名1,列名2）を入力してください。
        </div>
      </div>
    );
  }

  return (
    <div className="card-media">
      {/* フィルター */}
      <div className="card-media__toolbar">
        <input
          className="card-media__filter"
          type="text"
          placeholder="絞り込み…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <span className="card-media__count">{filteredRows.length} 件</span>
      </div>

      {/* カードグリッド */}
      <div className="card-media__grid card-media__grid--table">
        {filteredRows.map((row, ri) => (
          <div key={ri} className="card-media__card card-media__card--table">
            <div className="card-media__table-fields">
              {section.columns.map((col, ci) => (
                <div key={ci} className="card-media__field">
                  <span className="card-media__field-label">{col}</span>
                  <span className="card-media__field-value" title={row[ci] ?? ''}>
                    {row[ci] ?? ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filteredRows.length === 0 && (
          <div className="card-media__empty">
            {filter ? '一致する行はありません' : 'データ行がありません'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ThinkCardView（既存の Vault / Thought 一覧カード）───────────────────────

function ThinkCardView({ think, vault }: MediaProps) {
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
              <div className="card-media__card-header" style={{ borderTopColor: color }}>
                <span className="card-media__card-icon" style={{ color }}>
                  <Icon size={13} />
                </span>
                <span className="card-media__card-title" title={item.Name}>
                  {item.Name}
                </span>
              </div>
              <div className="card-media__card-body">
                {excerpt(item.Content)}
              </div>
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

// ── CardMedia ─────────────────────────────────────────────────────────────────

export function CardMedia(props: MediaProps) {
  if (props.think?.ContentType === 'table') {
    return <TableCardView think={props.think} />;
  }
  return <ThinkCardView {...props} />;
}
