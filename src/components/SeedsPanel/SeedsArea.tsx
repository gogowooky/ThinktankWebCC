/**
 * SeedsArea.tsx
 * SeedsPanel の表示エリア。
 *
 * - メニューリボン: ThinktankMenuRibbon 相当のボタン群
 * - Bundle ストリップ: 選択中 Bundle 名表示 + D&D ドロップターゲット
 * - フィルター / 日付フィルターバー: Think一覧モード(filter)のみ表示
 * - ColumnSortDialog
 * - 本体:
 *   - settings  → SeedsSettingsView（Bundle プロファイル）
 *   - filter    → 選択 Bundle 内の Think 一覧（datagrid メディアで描画）
 *   - project   → AbstractView（projectファイルの一覧と表示）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import type { TTThink } from '../../models/TTThink';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { useContentSearch } from '../../hooks/useContentSearch';
import { SeedsMenuRibbon } from './SeedsMenuRibbon';
import { SeedsSettingsView } from './SeedsSettingsView';
import type { SeedsSettingsViewRef } from './SeedsSettingsView';
import { SeedsFilterPanel } from './SeedsFilterPanel';
import type { SeedsFilterPanelRef } from './SeedsFilterPanel';
import { SeedsSearchBar } from './SeedsSearchBar';
import { ThoughtsList, applyFilter } from '../ThinktankPanel/ThoughtsList';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import { FilterSelectDialog, DEFAULT_FILTER_VISIBILITY } from '../ThinktankPanel/FilterSelectDialog';
import type { FilterVisibility } from '../ThinktankPanel/FilterSelectDialog';
import { applySort, applyDateFilter } from '../../utils/sortUtils';
import { buildBundleNames } from '../../utils/bundleNames';
import type { DateFilterState } from '../../utils/sortUtils';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import { CONTENT_TYPES, type ContentType } from '../../types';
import { projectTargetIds, updateProjectTargets } from '../../utils/thinkFormat';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { addTitleSearchKeywordToHighlighter } from '../../utils/highlighterKeyword';
import './SeedsArea.css';
import { AbstractView } from '../Abstract/AbstractView';
import { AiViewPanel, AiChatPanel } from '../AiPanels/AiPanels';
import { ProjectListFilters } from '../ThinktankPanel/ProjectListFilters';
import { useProjectStatusFilter } from '../../hooks/useProjectStatusFilter';

const ALL_CONTENT_TYPES: readonly ContentType[] = CONTENT_TYPES;

const SEEDS_MODE_NAMES: Record<string, string> = {
  filter:  'Think一覧',
  project: 'プロジェクト',
  aiview:  'AIView',
  aichat:  'AIChat',
};


interface Props {
  app:          TTApplication;
  showSettings: boolean;
  refreshKey?:  number;
}

export function SeedsArea({ app, showSettings, refreshKey }: Props) {
  const panel = app.SeedsPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);
  useAppUpdate(vault);

  // ── フィルター・チェック state ──────────────────────────────────────────────
  const [filter,           setFilter]           = useState('');
  const [showCheckedOnly,  setShowCheckedOnly]  = useState(false);
  const [createdDate,      setCreatedDate]      = useState('');
  const [createdRange,     setCreatedRange]     = useState('');
  const [updatedDate,      setUpdatedDate]      = useState('');
  const [updatedRange,     setUpdatedRange]     = useState('');
  const [columns,          setColumns]          = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,             setSort]             = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  // フィルター欄の表示/非表示設定（Think一覧用）
  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>(DEFAULT_FILTER_VISIBILITY);
  const [showFilterSelectDialog, setShowFilterSelectDialog] = useState(false);

  const [focusedId, setFocusedId] = useState<string | null>(() => panel.CurrentItemID || null);

  // 外部からの CurrentItem.ID の変更イベントを監視・同期
  useEffect(() => {
    const handleKeyChange = (key: string, val: string) => {
      setFocusedId(val || null);
    };
    TTUIStateManager.instance.addListener('SeedsPanel.CurrentItem.ID', handleKeyChange);
    return () => {
      TTUIStateManager.instance.removeListener('SeedsPanel.CurrentItem.ID', handleKeyChange);
    };
  }, []);

  useEffect(() => {
    setFocusedId(panel.CurrentItemID || null);
  }, [panel.CurrentItemID]);

  // 一覧表示する種別（初期は全種別ON）
  const [visibleTypes, setVisibleTypes] = useState<Set<ContentType>>(() => new Set(ALL_CONTENT_TYPES));

  // 検索 state（保管庫全体への全文/AI検索）
  const {
    searchQuery, searchResults, searchLoading, searchSearched,
    setSearchQuery, setSearchResults, setSearchSearched,
    handleSearchQueryChange, handleSearch,
  } = useContentSearch(vault, 'SeedsArea');

  const filterPanelRef                  = useRef<SeedsFilterPanelRef>(null);
  const settingsViewRef                 = useRef<SeedsSettingsViewRef>(null);

  // ── Think 一覧（project 設定中はその # 対象 に直接記載された Think、未設定なら全 Think）────
  const [thinksInBundle, setThinksInBundle] = useState<TTThink[]>([]);
  // 「プロジェクト」で # 対象 を書き換えたときも一覧を取り直す
  const bundleContent = panel.BundleID ? vault.GetThink(panel.BundleID)?.Content ?? '' : '';
  useEffect(() => {
    if (!panel.BundleID) { setThinksInBundle([]); return; }
    let cancelled = false;
    void vault.GetProjectTargetsAsync(panel.BundleID).then(newThinks => {
      if (cancelled) return;
      setThinksInBundle(newThinks);
      vault.NotifyUpdated();
    });
    return () => { cancelled = true; };
  }, [panel.BundleID, vault, refreshKey, vault.IsLoaded, vault.Count, bundleContent]);

  // ── メモ化済み計算 ────────────────────────────────────────────────────────

  const checkedSet = useMemo(() => new Set(panel.CheckedThoughtIDs), [panel.CheckedThoughtIDs]);

  // 母集合: 検索語があれば検索結果、なければ選択 Bundle 内の Think
  // project 未設定のときは Thinktank>Think一覧と同じく全ファイルを出す（追加・削除のときだけ取り直す）
  const allThinks = useMemo(() => vault.GetThinks(), [vault, vault.Count]); // eslint-disable-line react-hooks/exhaustive-deps
  const listBase = panel.ProjectID ? thinksInBundle : allThinks;
  // 検索語があれば検索結果。project 設定中はその配下に限る（Thinktank>Think一覧と同じ）
  const searchBase = useMemo(() => {
    if (!(searchSearched && searchQuery.trim() !== '')) return listBase;
    if (!panel.ProjectID) return searchResults;
    const memberIds = new Set(listBase.map(t => t.ID));
    return searchResults.filter(t => memberIds.has(t.ID));
  }, [searchSearched, searchQuery, searchResults, listBase, panel.ProjectID]);

  const typeOnlyBase = useMemo(
    () => searchBase.filter(t => visibleTypes.has(t.ContentType)),
    [searchBase, visibleTypes],
  );
  // 種別が project だけのときは、さらに # 状態・# 見通し で絞り込む
  const isProjectOnly = visibleTypes.size === 1 && visibleTypes.has('project');
  const projectStatus = useProjectStatusFilter(typeOnlyBase, isProjectOnly);
  const typeFilteredBase = projectStatus.filtered;

  // project だけのときは日付欄を隠すので、隠れた入力値で絞り込まない（値は他の種別へ戻したとき用に残す）
  const dateFilter = useMemo<DateFilterState>(() => ({
    show: !isProjectOnly,
    createdDate, createdRange, updatedDate, updatedRange,
  }), [isProjectOnly, createdDate, createdRange, updatedDate, updatedRange]);

  const bundleNames = useMemo(() => buildBundleNames(vault, typeFilteredBase), [vault, typeFilteredBase]);

  const visibleThinks = useMemo(() => {
    const base = showCheckedOnly
      ? typeFilteredBase.filter(t => checkedSet.has(t.ID))
      : typeFilteredBase;
    return applySort(applyDateFilter(applyFilter(base, filter), dateFilter), sort, bundleNames);
  }, [typeFilteredBase, showCheckedOnly, checkedSet, filter, dateFilter, sort, bundleNames]);

  const visibleIds = useMemo(() => visibleThinks.map(t => t.ID), [visibleThinks]);

  // SeedsPanel.Filter.CursorPos アクションが行番号を解決するための一覧スナップショット
  useEffect(() => {
    panel.FilteredThoughts = visibleThinks;
  }, [panel, visibleThinks]);


  // ── BundleID 変化時: 一覧状態リセット ＋ MetaOnly なら Content をロード ─
  const prevBundleIdRef = useRef(panel.BundleID);
  useEffect(() => {
    if (panel.BundleID === prevBundleIdRef.current) return;
    prevBundleIdRef.current = panel.BundleID;
    setFilter('');
    panel.SetCheckedThoughtIDs([]);
    setShowCheckedOnly(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchSearched(false);

    if (!panel.BundleID) return;
    const bundle = vault.GetThink(panel.BundleID);
    if (bundle?.IsMetaOnly) {
      void bundle.LoadContent().then(() => vault.NotifyUpdated());
    }
  }, [panel.BundleID, vault, setSearchQuery, setSearchResults, setSearchSearched]);

  // モード切り替え時に対応する入力要素へフォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showSettings) {
        settingsViewRef.current?.focus();
      } else if (panel.MediaType === 'datagrid') {
        filterPanelRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [showSettings, panel.MediaType]);

  const handleRefresh = useCallback(() => {
    if (!panel.BundleID) return;
    const bundle = vault.GetThink(panel.BundleID);
    if (!bundle) return;

    bundle.LoadContent(true)
      .then(() => {
        return vault.GetProjectTargetsAsync(panel.BundleID);
      })
      .then(newThinks => {
        setThinksInBundle(newThinks);
        vault.NotifyUpdated();
      })
      .catch(e => {
        console.error('[SeedsArea] refresh failed:', e);
      });
  }, [panel.BundleID, vault]);

  // ── メニューリボン ハンドラ ────────────────────────────────────────────────

  const handleCheckAll = useCallback(() => {
    panel.SetCheckedThoughtIDs(visibleIds);
  }, [visibleIds, panel]);

  const handleClearChecks = useCallback(() => panel.SetCheckedThoughtIDs([]), [panel]);

  const handleExcludeChecked = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0 || !panel.ProjectID) return;
    const bundle = vault.GetThink(panel.ProjectID);
    if (!bundle || bundle.ContentType !== 'project') return;
    if (bundle.IsMetaOnly) await bundle.LoadContent();

    // 書き換えるのはこの Project が直接参照している分だけ。配下の Project の中身をここへ展開しない
    const remaining = projectTargetIds(bundle.Content)
      .filter(id => !panel.CheckedThoughtIDs.includes(id));
    const remainingThinks = remaining.flatMap(id => vault.GetThink(id) ?? []);

    const newContent = updateProjectTargets(
      bundle.Content,
      remainingThinks.map(t => ({ id: t.ID, contentType: t.ContentType, title: t.Name })),
    );

    bundle.Content = newContent;
    bundle.RelatedIDs = remaining.join(',');

    await bundle.SaveContent();

    // 更新後のThink一覧を再取得してステートを更新し、変更を通知する
    const newThinks = await vault.GetProjectTargetsAsync(panel.ProjectID);
    setThinksInBundle(newThinks);
    vault.NotifyUpdated();

    panel.SetCheckedThoughtIDs([]);
  }, [panel, vault]);

  const handleToggleCheckedOnly   = useCallback(() => setShowCheckedOnly(v => !v), []);
  const handleToggleColumnDialog  = useCallback(() => setShowColumnDialog(v => !v), []);
  const handleToggleFilterSelectDialog = useCallback(() => setShowFilterSelectDialog(v => !v), []);

  const handleDeleteChecked = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0) return;
    if (!window.confirm(`${panel.CheckedThoughtIDs.length} 件を削除しますか？`)) return;
    app.RemoveThinksFromWorking(panel.CheckedThoughtIDs);
    await vault.DeleteThinks(panel.CheckedThoughtIDs);
    panel.SetCheckedThoughtIDs([]);
  }, [app, vault, panel]);

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

  // タイトル絞り込み実行（Enter確定時）
  const handleTitleFilterSearch = useCallback(() => {
    const q = filter.trim();
    if (!q) return;
    addTitleSearchKeywordToHighlighter(q);
  }, [filter]);

  const handleFocusChange = useCallback((id: string | null) => {
    const nextVal = id || '';
    if (panel.CurrentItemID !== nextVal) {
      panel.CurrentItemID = nextVal;
      setFocusedId(nextVal || null);
      TTUIStateManager.instance.notifyPropertyChanged('SeedsPanel.CurrentItem.ID');
    }
  }, [panel]);

  const handleToggleCheck = useCallback((id: string | string[], force?: boolean) => {
    const ids = Array.isArray(id) ? id : [id];
    const prev = panel.CheckedThoughtIDs;
    const nextSet = new Set(prev);
    ids.forEach(tid => {
      const next = (force !== undefined) ? force : !nextSet.has(tid);
      if (next) nextSet.add(tid);
      else nextSet.delete(tid);
    });
    panel.SetCheckedThoughtIDs(Array.from(nextSet));
  }, [panel]);

  // Project 種別は Seeds の「プロジェクト」にロード（一覧はその配下に切り替わる）、それ以外は Working へ
  const handleOpenThinkInWorking = useCallback((id: string) => {
    if (vault.GetThink(id)?.ContentType === 'project') panel.OpenProject(id, 'datagrid');
    else app.OpenThinkInWorking(id);
  }, [app, vault, panel]);

  // ── 算出値 ────────────────────────────────────────────────────────────────
  const think = panel.BundleID ? vault.GetThink(panel.BundleID) ?? null : null;
  const isThinkListMode = panel.MediaType === 'datagrid' && !showSettings;

  const seedsModeLabel = showSettings
    ? '設定'
    : (SEEDS_MODE_NAMES[panel.ViewMode] ?? panel.ViewMode);

  return (
    <div className="seeds-area">

      {/* ── タイトル行 ────────────────────────────────────────── */}
      <div className="panel-title-row seeds-area__title-row">
        Seeds&gt;{seedsModeLabel}
      </div>

      {/* ── メニューリボン ─────────────────────────────────────── */}
      <SeedsMenuRibbon
        showSettings={showSettings}
        mediaType={panel.MediaType}
        visibleIds={visibleIds}
        checkedIds={panel.CheckedThoughtIDs}
        showCheckedOnly={showCheckedOnly}
        showColumnDialog={showColumnDialog}
        showFilterSelectDialog={showFilterSelectDialog}
        visibleCount={visibleThinks.length}
        totalCount={typeFilteredBase.length}

        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onExcludeChecked={handleExcludeChecked}

        onToggleCheckedOnly={handleToggleCheckedOnly}
        onToggleColumnDialog={handleToggleColumnDialog}
        onToggleFilterSelectDialog={handleToggleFilterSelectDialog}
        onRefresh={handleRefresh}
      />

      {/* ── カラムソートダイアログ ─────────────────────────────── */}
      {showColumnDialog && (
        <ColumnSortDialog
          columns={columns}
          sort={sort}
          onColumnsChange={setColumns}
          onSortChange={setSort}
          onClose={() => setShowColumnDialog(false)}
        />
      )}

      {/* ── フィルター選択ダイアログ ───────────────────────────── */}
      {showFilterSelectDialog && (
        <FilterSelectDialog
          visibility={filterVisibility}
          onChange={setFilterVisibility}
          onClose={() => setShowFilterSelectDialog(false)}
        />
      )}

      {/* ── フィルターパネル + 検索バー（Think一覧モードのみ）────────── */}
      {isThinkListMode && (
        <>
          <SeedsFilterPanel
            ref={filterPanelRef}
            historyKey="seeds-filter"
            textValue={filter}
            onTextChange={setFilter}
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
          <SeedsSearchBar
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
            onClearAllTypes={handleClearAllTypes}
            showContentFilter={filterVisibility.content}
            showTypeFilter={filterVisibility.type}
          />
        </>
      )}

      {/* ── 本体 ───────────────────────────────────────────────── */}
      <div className="seeds-area__body">
        {showSettings ? (
          <SeedsSettingsView ref={settingsViewRef} think={think} vault={vault} onClear={() => panel.ClearProject()} />
        ) : panel.ViewMode === 'project' ? (
          <AbstractView projectView={panel.ProjectView} vault={vault} workingPanel={app.WorkingPanel} panelKey="seeds" />
        ) : panel.ViewMode === 'aiview' ? (
          <AiViewPanel panelKey="seeds" />
        ) : panel.ViewMode === 'aichat' ? (
          <AiChatPanel />
        ) : isThinkListMode ? (
          <ThoughtsList
            thoughts={visibleThinks}
            selectedId=""
            checkedIds={panel.CheckedThoughtIDs}
            columns={columns}
            bundleNames={bundleNames}
            onOpen={handleOpenThinkInWorking}
            onToggleCheck={handleToggleCheck}
            focusedId={focusedId}
            onFocusChange={handleFocusChange}
          />
        ) : !think ? (
          <div className="seeds-area__empty">
            <span>Bundle をドロップして選択してください</span>
          </div>
        ) : null}
      </div>

    </div>
  );
}
