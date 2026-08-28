/**
 * CardMedia.tsx
 * カード形式一覧メディア。
 *
 * - think.ContentType === 'table' → TableCardView（1行1カード、col:val形式）
 * - think が Bundle → 参照 Think 一覧カード
 * - それ以外 → Vault の全 Think（bundle 除く）カード
 */

import { useState, useMemo, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  FileText, Lightbulb, Table, Link, MessageCircle, Globe,
  RefreshCcw, ChevronDown, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type { TTThink } from '../../../models/TTThink';
import type { ContentType } from '../../../types';
import type { MediaProps } from './types';
import { parseTableContent } from '../../../utils/tableFormat';
import { TTUIStateManager } from '../../../views/TTUIStateManager';
import { applyFilter } from '../../ThinktankPanel/ThoughtsList';
import './CardMedia.css';

const CONTENT_ICONS: Record<ContentType, LucideIcon> = {
  memo:    FileText,
  bundle:  Lightbulb,
  table:   Table,
  links:   Link,
  chat:    MessageCircle,
  nettext: Globe,
};

const CONTENT_COLORS: Record<ContentType, string> = {
  memo:    '#3b78c4',
  bundle:  '#c9a227',
  table:   '#2e7d32',
  links:   '#7b1fa2',
  chat:    '#d32f2f',
  nettext: '#00838f',
};

function plainText(content: string): string {
  return content
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function formatDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : dateStr.slice(0, 10);
}

// ── CollapsibleValue ────────────────────────────────────────────────────────

const COLLAPSE_THRESHOLD = 100;

function CollapsibleValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  if (value.length <= COLLAPSE_THRESHOLD) {
    return <span className="card-media__field-value">{value}</span>;
  }
  return (
    <span className="card-media__field-value card-media__field-value--collapsible">
      <span className="card-media__field-value-text">
        {expanded ? value : value.slice(0, COLLAPSE_THRESHOLD) + '…'}
      </span>
      <button
        className="card-media__expand-btn"
        onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
      >
        {expanded ? '折りたたむ' : 'もっと見る'}
      </button>
    </span>
  );
}

// ── ThinkCard（個別カード、展開状態を持つ）──────────────────────────────

const BODY_COLLAPSE_THRESHOLD = 150;

function ThinkCard({ item, isFocus }: { item: TTThink; isFocus: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon  = CONTENT_ICONS[item.ContentType] ?? FileText;
  const color = CONTENT_COLORS[item.ContentType] ?? '#666';
  const body  = plainText(item.Content);
  const isLong = body.length > BODY_COLLAPSE_THRESHOLD;

  return (
    <div
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
        {isLong && !expanded
          ? body.slice(0, BODY_COLLAPSE_THRESHOLD) + '…'
          : body}
        {isLong && (
          <button
            className="card-media__body-expand-btn"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          >
            {expanded ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
            {expanded ? '折りたたむ' : 'もっと見る'}
          </button>
        )}
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
}

// ── TableCardView ─────────────────────────────────────────────────────────────

interface TableCardViewProps {
  think:   TTThink;
  onSave?: (content: string, thinkId?: string) => void;
}

function TableCardView({ think, onSave }: TableCardViewProps) {
  const [filter, setFilter] = useState('');
  const isUISettings = think.ID === TTUIStateManager.THINK_ID;

  const [sections, setSections] = useState(() => parseTableContent(think.Content));
  const section = sections[0] ?? null;

  const handleRefresh = useCallback(() => {
    const content = TTUIStateManager.instance.getLatestContent();
    if (!content) return;
    setSections(parseTableContent(content));
    onSave?.(content, think.ID);
  }, [onSave, think.ID]);

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
          autoComplete="off"
        />
        {isUISettings && (
          <button
            className="card-media__refresh-btn"
            onClick={handleRefresh}
            data-tip="UIから更新"
            data-tip-side="left"
          >
            <RefreshCcw size={13} />
          </button>
        )}
        <span className="card-media__count">
          {filteredRows.length}/{section.rows.length}
        </span>
      </div>

      {/* カードグリッド */}
      <div className="card-media__grid card-media__grid--table">
        {filteredRows.map((row, ri) => (
          <div key={ri} className="card-media__card card-media__card--table">
            <div className="card-media__table-fields">
              {section.columns.map((col, ci) => (
                <div key={ci} className="card-media__field">
                  <span className="card-media__field-label">{col}</span>
                  <CollapsibleValue value={row[ci] ?? ''} />
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
    if (think?.ContentType === 'bundle') {
      return vault.GetThinksForBundle(think.ID);
    }
    return vault.GetThinks().filter(t => t.ContentType !== 'bundle');
  }, [think, vault]);

  const filtered = useMemo<TTThink[]>(() => {
    return applyFilter(allItems, filter);
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
          autoComplete="off"
        />
        <span className="card-media__count">
          {filtered.length}/{allItems.length}
        </span>
      </div>

      <div className="card-media__grid">
        {filtered.map(item => (
          <ThinkCard
            key={item.ID}
            item={item}
            isFocus={think?.ID === item.ID}
          />
        ))}

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

export interface CardMediaRef { focus: () => void; }

export const CardMedia = forwardRef<CardMediaRef, MediaProps>(function CardMedia(props, ref) {
  const cardRootRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const input = cardRootRef.current?.querySelector<HTMLInputElement>('.card-media__filter');
      input?.focus();
    },
  }));

  if (props.think?.ContentType === 'table') {
    return (
      <div ref={cardRootRef} style={{ display: 'contents' }}>
        <TableCardView think={props.think} onSave={props.onSave} />
      </div>
    );
  }
  return (
    <div ref={cardRootRef} style={{ display: 'contents' }}>
      <ThinkCardView {...props} />
    </div>
  );
});
