/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 *
 * Think一覧（filter）モードは「検索」「Bundle一覧」を統合したもの:
 *   - 上部: タイトル/キーワードによる絞り込み欄
 *   - 日付フィルター（常時表示）
 *   - 全文/AI 検索のキーワード欄＋検索オプション
 *   - 一覧表示する種別（ContentType）の選択ボタン
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { TTThink } from '../../models/TTThink';
import { useContentSearch } from '../../hooks/useContentSearch';
import { useThinktankViewMode } from '../../hooks/useThinktankViewMode';
import { ThinktankMenuRibbon } from './ThinktankMenuRibbon';
import { ThinktankFilterPanel } from './ThinktankFilterPanel';
import type { ThinktankFilterPanelRef } from './ThinktankFilterPanel';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchBar } from './ThinktankSearchBar';
import { applySort } from '../../utils/sortUtils';
import { buildBundleNames } from '../../utils/bundleNames';
import { CONTENT_TYPES, type ContentType } from '../../types';
import { ThinktankSettingsView } from './ThinktankSettingsView';
import type { ThinktankSettingsViewRef } from './ThinktankSettingsView';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from './ColumnSortDialog';
import type { ColumnConfig, SortConfig } from './ColumnSortDialog';
import { FilterSelectDialog, DEFAULT_FILTER_VISIBILITY } from './FilterSelectDialog';
import type { FilterVisibility } from './FilterSelectDialog';
import { AbstractView } from '../Abstract/AbstractView';
import { AiViewPanel, AiChatPanel } from '../AiPanels/AiPanels';
import { ProjectListFilters } from './ProjectListFilters';
import { useProjectStatusFilter } from '../../hooks/useProjectStatusFilter';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { addTitleSearchKeywordToHighlighter } from '../../utils/highlighterKeyword';
import { VaultLoadNotice } from './VaultLoadNotice';
import { childProjectIds } from '../../utils/thinkTree';
import './ThinktankArea.css';

import type { LayoutMode } from '../Layout/AppLayout';

const THINKTANK_MODE_NAMES: Record<string, string> = {
  filter:   'Think一覧',
  project:  'プロジェクト',
  aiview:   'AIView',
  aichat:   'AIChat',
  settings: '設定',
};

const ALL_CONTENT_TYPES: readonly ContentType[] = CONTENT_TYPES;
// Edit（=simple）で開く種別。編集の対象になる本文だけを出す。Projectは資料の束、
// Chatは会話履歴で、どれもここで書き換えるものではないので既定では出さない。
const EDIT_CONTENT_TYPES: ContentType[] = ['memo', 'table', 'links', 'html'];
const defaultVisibleTypes = (mode: LayoutMode) => new Set<ContentType>(mode === 'simple' ? EDIT_CONTENT_TYPES : ['project']);

interface Props {
  app: TTApplication;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onRefresh: () => void;
}

export function ThinktankArea({ app, layoutMode, onLayoutModeChange, onRefresh }: Props) {
  const panel = app.ThinktankPanel;
  const vault = app.Models.Vault;

  useAppUpdate(panel);
  useAppUpdate(vault);

  const viewMode = useThinktankViewMode(panel, layoutMode);

  // filter モードの可視アイテムとタイトルクエリはコールバックで受け取る
  const [filterVisible,    setFilterVisible]    = useState<TTThink[]>([]);
  const [filterTitleQuery, setFilterTitleQuery] = useState('');

  const [focusedId, setFocusedId] = useState<string | null>(() => panel.CurrentItemID || null);
  const [focusedRow, setFocusedRow] = useState<number>(() => panel.CurrentItemRow);

  // 外部からの CurrentItem.ID の変更イベントを監視・同期
  // （カーソル行アクションは CurrentItemRow も更新してから通知する）
  useEffect(() => {
    const handleKeyChange = (_key: string, val: string) => {
      setFocusedId(val || null);
      setFocusedRow(panel.CurrentItemRow);
    };
    TTUIStateManager.instance.addListener('ThinktankPanel.CurrentItem.ID', handleKeyChange);
    return () => {
      TTUIStateManager.instance.removeListener('ThinktankPanel.CurrentItem.ID', handleKeyChange);
    };
  }, []);

  useEffect(() => {
    setFocusedId(panel.CurrentItemID || null);
  }, [panel.CurrentItemID]);

  const handleFilterVisibleChange = useCallback((items: TTThink[]) => {
    setFilterVisible(prev => {
      if (prev.length === items.length && prev.every((t, i) => t === items[i])) return prev;
      return items;
    });
  }, []);

  // 表示カラム・ソート設定
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,    setSort]    = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  // フィルター欄の表示/非表示設定（Think一覧用）
  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>(DEFAULT_FILTER_VISIBILITY);
  const [showFilterSelectDialog, setShowFilterSelectDialog] = useState(false);

  // 日付フィルター state（常時表示）
  const [createdDate,  setCreatedDate]  = useState('');
  const [createdRange, setCreatedRange] = useState('');
  const [updatedDate,  setUpdatedDate]  = useState('');
  const [updatedRange, setUpdatedRange] = useState('');

  // 一覧表示する種別。起動時もモードの既定で開く（Edit で開き直したとき Bundle のみに
  // なっていると、切り替えた場合と見え方が変わる）。
  const [visibleTypes, setVisibleTypes] = useState<Set<ContentType>>(() => defaultVisibleTypes(layoutMode));

  // 表示モードの切り替え時に種別フィルターを既定へ戻す（Edit=編集対象の種別 / Think=Bundleのみ）。
  // 切り替えの瞬間だけ効かせ、その後のユーザー操作は上書きしない。
  const prevLayoutModeRef = useRef(layoutMode);
  useEffect(() => {
    const prev = prevLayoutModeRef.current;
    prevLayoutModeRef.current = layoutMode;
    if (prev === layoutMode) return;
    setVisibleTypes(defaultVisibleTypes(layoutMode));
  }, [layoutMode]);

  const filterPanelRef   = useRef<ThinktankFilterPanelRef>(null);
  const settingsViewRef  = useRef<ThinktankSettingsViewRef>(null);
  const pendingSearchQueryRef = useRef<string | null>(null);

  // panel.Filter / panel.ContentFilter が外部からセットされたとき各フィールドに反映する
  useEffect(() => {
    if (!panel.Filter && !panel.ContentFilter) return;
    // すべての欄を一旦クリア
    setFilterTitleQuery('');
    setSearchQuery('');
    setSearchResults([]);
    setSearchSearched(false);
    setCreatedDate('');
    setCreatedRange('');
    setUpdatedDate('');
    setUpdatedRange('');
    // 種別フィルターと値をセット
    const types = panel.FilterVisibleTypes
      ? new Set(panel.FilterVisibleTypes)
      : new Set(ALL_CONTENT_TYPES);
    setVisibleTypes(types);
    if (panel.Filter) {
      setFilterTitleQuery(panel.Filter);
    }
    if (panel.ContentFilter) {
      const q = panel.ContentFilter;
      setSearchQuery(q);
      pendingSearchQueryRef.current = q;
    }
    panel.ClearFilter();
  }, [panel.Filter, panel.ContentFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // mode 切り替え時: 適切な入力要素に自動フォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      switch (viewMode) {
        case 'filter':
          filterPanelRef.current?.focus();
          break;
        case 'settings':
          settingsViewRef.current?.focus();
          break;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode]);

  // 全種別検索フラグの監視
  useEffect(() => {
    if (panel.ShouldResetTypesToAll) {
      panel.ShouldResetTypesToAll = false;
      setVisibleTypes(new Set(ALL_CONTENT_TYPES));
    }
  }, [panel.ShouldResetTypesToAll, panel]);

  // 検索 state（ビュー切り替えで消えないよう ThinktankArea で保持）
  const {
    searchQuery, searchResults, searchLoading, searchSearched,
    setSearchQuery, setSearchResults, setSearchSearched,
    handleSearchQueryChange, handleSearch,
  } = useContentSearch(vault, 'ThinktankArea');

  // ── メモ化済み計算 ────────────────────────────────────────────────────────

  // 追加・削除・正本との照合で一覧が変わったときのみ再取得
  const allThinks = useMemo(() => vault.GetThinks(), [vault.Count, vault.ListRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  // projectファイルをロード中は、その配下の Think だけを一覧の母集合にする。
  // 「プロジェクト」で # 対象 を書き換えたときも取り直す
  const loadedProjectId = panel.ProjectID;
  const loadedProjectContent = loadedProjectId ? vault.GetThink(loadedProjectId)?.Content ?? '' : '';
  const [projectMembers, setProjectMembers] = useState<TTThink[] | null>(null);
  useEffect(() => {
    if (!loadedProjectId) { setProjectMembers(null); return; }
    let cancelled = false;
    void vault.GetProjectDescendantsAsync(loadedProjectId).then(members => {
      if (!cancelled) setProjectMembers(members);
    });
    return () => { cancelled = true; };
  }, [loadedProjectId, loadedProjectContent, vault, vault.Count, vault.IsLoaded]);
  const listBase = useMemo(
    () => (loadedProjectId ? projectMembers ?? [] : allThinks),
    [loadedProjectId, projectMembers, allThinks],
  );

  // 母集合: 検索語があれば検索結果（ロード中は配下に限る）、なければ一覧の母集合
  const searchBase = useMemo(() => {
    if (!(searchSearched && searchQuery.trim() !== '')) return listBase;
    if (!loadedProjectId) return searchResults;
    const memberIds = new Set(listBase.map(t => t.ID));
    return searchResults.filter(t => memberIds.has(t.ID));
  }, [searchSearched, searchQuery, searchResults, listBase, loadedProjectId]);

  // 種別フィルター → ソート（タイトル/日付/チェックは FilterView 側で適用）
  const typeOnlyBase = useMemo(
    () => searchBase.filter(t => visibleTypes.has(t.ContentType)),
    [searchBase, visibleTypes],
  );
  // 種別が project だけのときは、さらに # 状態・# 見通し で絞り込む
  const isProjectOnly = visibleTypes.size === 1 && visibleTypes.has('project');
  const projectStatus = useProjectStatusFilter(typeOnlyBase, isProjectOnly);
  const typeFilteredBase = projectStatus.filtered;
  // 種別が project だけのときは Tree 表示にし、各 Project の下にそれが含む Project を並べる。
  // 含む Project は本文から読むので、本文未読の Project は先に読む
  const projectsKey = isProjectOnly
    ? allThinks.filter(t => t.ContentType === 'project').map(t => `${t.ID}@${t.UpdatedAt}`).join('\0')
    : '';
  const [childProjectMap, setChildProjectMap] = useState<Map<string, string[]> | null>(null);
  useEffect(() => {
    if (!isProjectOnly) { setChildProjectMap(null); return; }
    let cancelled = false;
    const projects = vault.GetThinks().filter(t => t.ContentType === 'project');
    void Promise.all(projects.filter(p => p.IsMetaOnly).map(p => p.LoadContent().catch(() => undefined))).then(() => {
      if (cancelled) return;
      const isProject = (id: string) => vault.GetThink(id)?.ContentType === 'project';
      setChildProjectMap(new Map(projects.map(p => [p.ID, childProjectIds(p, isProject)])));
    });
    return () => { cancelled = true; };
  }, [isProjectOnly, projectsKey, vault]);
  const childProjectsOf = useMemo(() => {
    if (!childProjectMap) return undefined;
    return (id: string) => (childProjectMap.get(id) ?? [])
      .map(childId => vault.GetThink(childId))
      .filter((t): t is TTThink => t !== undefined);
  }, [childProjectMap, vault]);

  const bundleNames = useMemo(() => buildBundleNames(vault, typeFilteredBase), [vault, typeFilteredBase]);
  const sortedBase = useMemo(() => applySort(typeFilteredBase, sort, bundleNames), [typeFilteredBase, sort, bundleNames]);

  // chat / settings 以外はすべて Think一覧（filter）として扱う（旧モードの残存値対策）
  const isFilterMode = viewMode === 'filter';

  const visibleThinks = isFilterMode ? filterVisible : [];
  // Tree 表示では同じ Think が複数の行に出るので、ID の一覧は重複を除く
  const visibleIds = useMemo(() => [...new Set(visibleThinks.map(t => t.ID))], [visibleThinks]);

  // ThinktankPanel.Filter.CursorPos アクションが行番号を解決するための一覧スナップショット
  useEffect(() => {
    panel.FilteredThoughts = visibleThinks;
  }, [panel, visibleThinks]);

  // ── ハンドラ ─────────────────────────────────────────────────────────────

  const handleSelect = useCallback((id: string) => {
    const bundleId = app.SeedsPanel.BundleID;
    if (bundleId) {
      const thinks = vault.GetThinksForBundle(bundleId);
      if (!thinks.some(t => t.ID === id)) return;
    }
    app.OpenThinkInWorking(id);
  }, [app, vault]);

  // Project 種別は Thinktank の「プロジェクト」にロード（一覧はその配下に絞られる）、それ以外は Working へ
  const handleOpenItem = useCallback((id: string) => {
    const t = vault.GetThink(id);
    if (t?.ContentType === 'project') {
      panel.OpenProject(id);
    } else {
      handleSelect(id);
    }
  }, [panel, vault, handleSelect]);

  const handleFocusChange = useCallback((id: string | null, row?: number) => {
    const nextVal = id || '';
    // 同じ ID の別の行（Tree 表示の重複行）へ移ったときも行だけは更新する
    panel.CurrentItemRow = row ?? -1;
    setFocusedRow(panel.CurrentItemRow);
    if (panel.CurrentItemID !== nextVal) {
      panel.CurrentItemID = nextVal;
      setFocusedId(nextVal || null);
      TTUIStateManager.instance.notifyPropertyChanged('ThinktankPanel.CurrentItem.ID');
    }
  }, [panel]);

  const handleToggleCheck = useCallback((id: string | string[], force?: boolean) => {
    panel.ToggleCheck(id, force);
  }, [panel]);

  const handleCheckAll = useCallback(() => {
    panel.CheckAll(visibleIds);
  }, [panel, visibleIds]);

  const handleClearChecks = useCallback(() => {
    panel.ClearChecks();
  }, [panel]);

  const handleDeleteChecked = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0) return;
    if (!window.confirm(`${panel.CheckedThoughtIDs.length} 件を削除しますか？`)) return;
    app.RemoveThinksFromWorking(panel.CheckedThoughtIDs);
    await vault.DeleteThinks(panel.CheckedThoughtIDs);
    panel.ClearChecks();
  }, [app, panel, vault]);

  const handleToggleCheckedOnly = useCallback(() => {
    panel.ToggleShowCheckedOnly();
  }, [panel]);

  const handleToggleColumnDialog = useCallback(() => {
    setShowColumnDialog(v => !v);
  }, []);

  const handleToggleFilterSelectDialog = useCallback(() => {
    setShowFilterSelectDialog(v => !v);
  }, []);

  const handleToggleType = useCallback((t: ContentType) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const handleSelectAllTypes = useCallback(() => setVisibleTypes(new Set(ALL_CONTENT_TYPES)), []);
  const handleClearAllTypes  = useCallback(() => setVisibleTypes(new Set()), []);

  const canCreateBundle = panel.CheckedThoughtIDs.length > 0 || visibleIds.length > 0;

  const handleCreateBundle = useCallback(async () => {
    const ids = panel.CheckedThoughtIDs.length > 0 ? panel.CheckedThoughtIDs : visibleIds;
    await vault.CreateBundleFromIds(ids);
    panel.ClearChecks();
  }, [panel, vault, visibleIds]);

  // pendingSearchQueryRef がセットされていて searchQuery が一致したら検索実行
  useEffect(() => {
    if (pendingSearchQueryRef.current !== null && searchQuery === pendingSearchQueryRef.current) {
      pendingSearchQueryRef.current = null;
      void handleSearch();
    }
  }, [searchQuery, handleSearch]);

  // タイトル絞り込み実行（Enter確定時）
  const handleTitleFilterSearch = useCallback(() => {
    const q = filterTitleQuery.trim();
    if (!q) return;
    addTitleSearchKeywordToHighlighter(q);
  }, [filterTitleQuery]);

  // ── モード別コンテンツ ───────────────────────────────────────────────────

  let content: React.ReactNode;

  if (viewMode === 'settings') {
    content = <ThinktankSettingsView ref={settingsViewRef} />;
  } else if (viewMode === 'project') {
    content = <AbstractView projectView={panel.ProjectView} vault={vault} workingPanel={app.WorkingPanel} panelKey="thinktank" />;
  } else if (viewMode === 'aiview') {
    content = <AiViewPanel panelKey="thinktank" />;
  } else if (viewMode === 'aichat') {
    content = <AiChatPanel panelKey="thinktank" />;
  } else if (!vault.IsLoaded && vault.LoadError) {
    // 読めなかった一覧を空の一覧として見せない（新しいPCで未ログインのとき等）
    content = (
      <VaultLoadNotice
        vault={vault}
        error={vault.LoadError}
        onOpenSettings={() => panel.SetViewMode('settings')}
      />
    );
  } else {
    // filter モード（検索・Project一覧を統合）
    content = (
      <ThinktankFilterView
        thinks={sortedBase}
        selectedId={panel.SelectedProjectID}
        checkedIds={panel.CheckedThoughtIDs}
        checkedOnly={panel.ShowCheckedOnly}
        // project だけのときは日付欄を隠すので、隠れた入力値で絞り込まない（値は他の種別へ戻したとき用に残す）
        createdDate={isProjectOnly ? '' : createdDate}
        createdRange={isProjectOnly ? '' : createdRange}
        updatedDate={isProjectOnly ? '' : updatedDate}
        updatedRange={isProjectOnly ? '' : updatedRange}
        columns={columns}
        bundleNames={bundleNames}
        onOpen={handleOpenItem}
        onToggleCheck={handleToggleCheck}
        onVisibleChange={handleFilterVisibleChange}
        titleQuery={filterTitleQuery}
        focusedId={focusedId}
        focusedRow={focusedRow}
        onFocusChange={handleFocusChange}
        childrenOf={isProjectOnly ? childProjectsOf : undefined}
      />
    );
  }

  return (
    <div className="thinktank-area">
      <div className="panel-title-row thinktank-area__title-row">
        Thinktank&gt;{THINKTANK_MODE_NAMES[viewMode] ?? viewMode}
      </div>
      <ThinktankMenuRibbon
        viewMode={viewMode}
        visibleIds={visibleIds}
        checkedIds={panel.CheckedThoughtIDs}
        showCheckedOnly={panel.ShowCheckedOnly}
        showColumnDialog={showColumnDialog}
        showFilterSelectDialog={showFilterSelectDialog}
        canCreateBundle={canCreateBundle}
        visibleCount={filterVisible.length}
        totalCount={listBase.length}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onToggleColumnDialog={handleToggleColumnDialog}
        onToggleFilterSelectDialog={handleToggleFilterSelectDialog}
        onCreateBundle={handleCreateBundle}
        onRefresh={onRefresh}
      />

      {showColumnDialog && (
        <ColumnSortDialog
          columns={columns}
          sort={sort}
          onColumnsChange={setColumns}
          onSortChange={setSort}
          onClose={() => setShowColumnDialog(false)}
        />
      )}

      {showFilterSelectDialog && (
        <FilterSelectDialog
          visibility={filterVisibility}
          onChange={setFilterVisibility}
          onClose={() => setShowFilterSelectDialog(false)}
        />
      )}

      {isFilterMode && (
        <>
          <ThinktankFilterPanel
            ref={filterPanelRef}
            historyKey="tt-filter"
            textValue={filterTitleQuery}
            onTextChange={setFilterTitleQuery}
            onSearch={handleTitleFilterSearch}
            createdDate={createdDate}
            onCreatedDateChange={setCreatedDate}
            createdRange={createdRange}
            onCreatedRangeChange={setCreatedRange}
            updatedDate={updatedDate}
            onUpdatedDateChange={setUpdatedDate}
            updatedRange={updatedRange}
            onUpdatedRangeChange={setUpdatedRange}
            showTextFilter={filterVisibility.title}
            showCreatedDateFilter={filterVisibility.createdDate && !isProjectOnly}
            showUpdatedDateFilter={filterVisibility.updatedDate && !isProjectOnly}
          />
          <ThinktankSearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={handleSearchQueryChange}
            onSearch={handleSearch}
            loading={searchLoading}
            visibleTypes={visibleTypes}
            typeSubFilters={isProjectOnly && (
              <ProjectListFilters
                states={projectStatus.states}
                outlooks={projectStatus.outlooks}
                onStatesChange={projectStatus.setStates}
                onOutlooksChange={projectStatus.setOutlooks}
              />
            )}
            onToggleType={handleToggleType}
            onSelectAllTypes={handleSelectAllTypes}
            showContentFilter={filterVisibility.content}
            showTypeFilter={filterVisibility.type}
            onClearAllTypes={handleClearAllTypes}
          />
        </>
      )}

      <div className="thinktank-area__body">
        {content}
      </div>
    </div>
  );
}
