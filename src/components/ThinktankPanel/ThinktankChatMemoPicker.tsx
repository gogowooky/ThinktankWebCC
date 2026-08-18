/**
 * ThinktankChatMemoPicker.tsx
 * AI相談モードのツール直下に表示する、chat Think 選択用の
 * フィルター（タイトル・作成日(ID)・更新日・コンテンツ）＋ DataGrid。
 * 列構成・ソート・フィルター表示設定は Think一覧（表示項目とソート／フィルター選択）と共有する。
 *
 * - フォーカス中: 絞り込み結果を最大5件まで表示（それ以上はスクロール）
 *   フィルター未設定なら絞り込み結果 = 全対象ファイル
 * - フォーカスが外れ、かつ選択中のアイテムがある場合: その1件だけを表示し、高さも1行分に縮小する
 * - フォーカスが外れていても未選択の場合は、絞り込み結果（フィルター未設定なら全対象ファイル）を表示する
 * - 先頭に「新規チャット」の仮想行（NEW_CHAT_SENTINEL_ID）を常時表示する（1件だけに絞られた表示時を除く）。
 *   これはフィルター・ソートの対象外で、選択されると呼び出し側が新規 chat Think を作る
 * - Workout の Pane で開けるのは D&D（行の draggable）のみ。ダブルクリックでは開かない
 *   （chatファイルは下のエリアで直接続きの対話ができるため、二重の入口を持たせない）
 * - チェックボックスも表示する。チェック状態は Think一覧（Thinktank/Overview/Workout/ReThink）と
 *   共通の SharedState（TTApplication がパネル間で共有）なので、ここでチェックしたchatファイルも
 *   Thinktank>Think一覧の削除ボタンから削除できる。「新規チャット」の仮想行はチェック対象外
 */

import { useState, useMemo, useCallback } from 'react';
import { TTThink } from '../../models/TTThink';
import type { ColumnConfig, SortConfig } from './ColumnSortDialog';
import type { FilterVisibility } from './FilterSelectDialog';
import { ThinktankFilterPanel } from './ThinktankFilterPanel';
import { ThinktankSearchBar } from './ThinktankSearchBar';
import { ThoughtsList, applyFilter, ROW_HEIGHT } from './ThoughtsList';
import { applySort, applyDateFilter } from '../../utils/sortUtils';
import { addContentSearchKeywordToHighlighter, addTitleSearchKeywordToHighlighter } from '../../utils/highlighterKeyword';
import { NEW_CHAT_SENTINEL_ID } from '../../utils/thinkFormat';
import type { ContentType } from '../../types';
import './ThinktankChatMemoPicker.css';

const MAX_VISIBLE_ROWS = 5;
const EMPTY_TYPES = new Set<ContentType>();
const NOOP = () => {};

/** DataGrid先頭に常時表示する「新規チャット」の仮想行。実在の Think ではないので vault には持たせない */
function makeNewChatItem(): TTThink {
  const item = new TTThink();
  item.ID          = NEW_CHAT_SENTINEL_ID;
  item.ContentType = 'chat';
  item.setContentSilent('＋ 新規チャット');
  return item;
}

interface Props {
  thinks:           TTThink[];
  columns:           ColumnConfig[];
  sort:              SortConfig;
  filterVisibility:  FilterVisibility;
  selectedId:        string;
  onSelect:          (id: string) => void;
  /** Think一覧と共通のチェック済みID一覧・トグル関数（TTApplication の SharedState 経由） */
  checkedIds:        string[];
  onToggleCheck:     (id: string | string[], force?: boolean) => void;
}

export function ThinktankChatMemoPicker({
  thinks, columns, sort, filterVisibility, selectedId, onSelect, checkedIds, onToggleCheck,
}: Props) {
  const [isFocused,    setIsFocused]    = useState(false);
  const [titleQuery,   setTitleQuery]   = useState('');
  const [createdDate,  setCreatedDate]  = useState('');
  const [createdRange, setCreatedRange] = useState('');
  const [updatedDate,  setUpdatedDate]  = useState('');
  const [updatedRange, setUpdatedRange] = useState('');
  const [contentQuery, setContentQuery] = useState('');

  const filtered = useMemo(() => {
    let items = applyFilter(thinks, titleQuery);
    items = applyDateFilter(items, { show: true, createdDate, createdRange, updatedDate, updatedRange });
    const q = contentQuery.trim().toLowerCase();
    if (q) items = items.filter(t => t.Content.toLowerCase().includes(q));
    return applySort(items, sort);
  }, [thinks, titleQuery, createdDate, createdRange, updatedDate, updatedRange, contentQuery, sort]);

  // フォーカスが外れていて選択中のアイテムがある場合のみ、その1件だけに絞る（新規チャット行も隠す）。
  // それ以外（フォーカス中、または選択なし）は「新規チャット」行 + 絞り込み結果を表示する
  // （フィルター未設定なら絞り込み結果 = 全対象ファイル）
  const selectedThink = useMemo(() => thinks.find(t => t.ID === selectedId) ?? null, [thinks, selectedId]);
  const newChatItem   = useMemo(() => makeNewChatItem(), []);
  const displayItems  = (!isFocused && selectedThink) ? [selectedThink] : [newChatItem, ...filtered];
  const gridHeight    = displayItems.length > 0
    ? Math.min(displayItems.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT
    : 0;

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur  = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsFocused(false);
  }, []);

  const handleFocusChange = useCallback((id: string | null) => {
    if (id) onSelect(id);
  }, [onSelect]);

  // タイトル絞り込み実行（Enter確定時）
  const handleTitleSearch = useCallback(() => {
    const q = titleQuery.trim();
    if (!q) return;
    addTitleSearchKeywordToHighlighter(q);
  }, [titleQuery]);

  // コンテンツ絞り込み実行（Enter確定時）
  const handleContentSearch = useCallback(() => {
    const q = contentQuery.trim();
    if (!q) return;
    addContentSearchKeywordToHighlighter(q);
  }, [contentQuery]);

  return (
    <div className="tt-chat-picker" onFocus={handleFocus} onBlur={handleBlur}>
      <ThinktankFilterPanel
        historyKey="tt-chat-picker"
        textValue={titleQuery}
        onTextChange={setTitleQuery}
        onSearch={handleTitleSearch}
        createdDate={createdDate}
        onCreatedDateChange={setCreatedDate}
        createdRange={createdRange}
        onCreatedRangeChange={setCreatedRange}
        updatedDate={updatedDate}
        onUpdatedDateChange={setUpdatedDate}
        updatedRange={updatedRange}
        onUpdatedRangeChange={setUpdatedRange}
        showTextFilter={filterVisibility.title}
        showCreatedDateFilter={filterVisibility.createdDate}
        showUpdatedDateFilter={filterVisibility.updatedDate}
      />
      <ThinktankSearchBar
        searchQuery={contentQuery}
        onSearchQueryChange={setContentQuery}
        onSearch={handleContentSearch}
        loading={false}
        visibleTypes={EMPTY_TYPES}
        onToggleType={NOOP}
        onSelectAllTypes={NOOP}
        onClearAllTypes={NOOP}
        showContentFilter={filterVisibility.content}
        showTypeFilter={false}
      />
      {gridHeight > 0 && (
        <div className="tt-chat-picker__grid" style={{ height: gridHeight }}>
          <ThoughtsList
            thoughts={displayItems}
            selectedId={selectedId}
            showCheckbox
            checkedIds={checkedIds}
            onToggleCheck={onToggleCheck}
            columns={columns}
            focusedId={selectedId}
            onFocusChange={handleFocusChange}
          />
        </div>
      )}
    </div>
  );
}
