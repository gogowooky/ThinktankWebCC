import { useSupportSelection } from '../../hooks/useSupportSelection';
import { SupportChat, type SupportChatRef } from '../ThoughtSupport/SupportChat';
import { useSupportChats } from '../../hooks/useSupportChats';
/**
 * ReThinkArea.tsx
 * Phase 10: ReThinkPanel のメインエリア。
 *
 * - メモ選択(DataGrid) + ReThinkChat（AI との CLI ターミナル風チャット）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ReThinkMenuRibbon } from './ReThinkMenuRibbon';
import type { ReThinkViewMode } from './ReThinkTabBar';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import { FilterSelectDialog, DEFAULT_CHAT_FILTER_VISIBILITY } from '../ThinktankPanel/FilterSelectDialog';
import type { FilterVisibility } from '../ThinktankPanel/FilterSelectDialog';
import { ThinktankChatMemoPicker } from '../ThinktankPanel/ThinktankChatMemoPicker';
import { NEW_CHAT_SENTINEL_ID } from '../../utils/thinkFormat';
import '../../components/Layout/MenuRibbon.css';
import './ReThinkArea.css';

const RETHINK_MODE_NAMES: Record<ReThinkViewMode, string> = {
  chat:     'AI相談',
  settings: '設定',
};

interface Props {
  app:      TTApplication;
  viewMode: ReThinkViewMode;
}

export function ReThinkArea({ app, viewMode }: Props) {
  const panel = app.ReThinkPanel;
  useAppUpdate(panel);
  useAppUpdate(app.OverviewPanel);

  const vault       = app.Models.Vault;
  useAppUpdate(vault);

  // コンテキスト付きシステムプロンプトを生成
  const reThinkChatRef     = useRef<SupportChatRef>(null);
  const settingsCheckRef   = useRef<HTMLInputElement>(null);
  const [selectedTodoMemoId, setSelectedTodoMemoId] = useSupportSelection(vault, 'ReThink');
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,    setSort]    = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>(DEFAULT_CHAT_FILTER_VISIBILITY);
  const [showFilterSelectDialog, setShowFilterSelectDialog] = useState(false);

  // 担当・Bundleの範囲に合う相談と、継続中の選択を表示する。
  const overviewBundleId = app.OverviewPanel.BundleID;
  const { chats: todoMemoThinks, error: supportListError } = useSupportChats(vault, "ReThink", app.OverviewPanel.BundleID, selectedTodoMemoId);

  // 選択中の TODO メモが一覧から消えたら選択を空に戻す
  useEffect(() => {
    if (vault.IsLoaded && selectedTodoMemoId && !vault.GetThink(selectedTodoMemoId)) {
      setSelectedTodoMemoId('');
    }
  }, [todoMemoThinks, selectedTodoMemoId]);

  const handleToggleColumnDialog = useCallback(() => setShowColumnDialog(v => !v), []);
  const handleToggleFilterSelectDialog = useCallback(() => setShowFilterSelectDialog(v => !v), []);
  const handleRefresh = useCallback(() => {
    app.RefreshAll().catch(e => console.error('[ReThinkArea] RefreshAll failed:', e));
  }, [app]);
  // モード切り替え時に対応する入力要素へフォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewMode === 'chat')     reThinkChatRef.current?.focus();
      if (viewMode === 'settings') settingsCheckRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode]);

  // 選択中のThinkがあればそこへ上書き保存、なければ新規の chat Think として保存する（Overviewの選択中Bundleへリンク）
  const handleSaveChat = useCallback(() => reThinkChatRef.current?.save(), []);

  const saveChatTip = selectedTodoMemoId
    ? `Chatを${selectedTodoMemoId}に保管します`
    : 'Chatを新規のchatとして保管します';

  // chatファイル選択: 選択されたchatファイルの内容をChatにロードする（空選択でクリア）。
  // 「新規チャット」行が選ばれた場合もファイルは作らず、空選択と同じ「未保存の新規チャット」状態にする。
  // 入力と応答は共通チャットが自動保存する。
  const handleSelectTodoMemo = useCallback((id: string) => {
    reThinkChatRef.current?.abortStreaming();
    setSelectedTodoMemoId(id === NEW_CHAT_SENTINEL_ID ? '' : id);
  }, []);


  return (
    <div className="rethink-area">

      {/* ── タイトル行 ────────────────────────────────────────── */}
      <div className="panel-title-row rethink-area__title-row">
        ReThink&gt;{RETHINK_MODE_NAMES[viewMode]}
      </div>

      {/* ── メニューリボン ─────────────────────────────────────── */}
      <ReThinkMenuRibbon
        viewMode={viewMode}
        canSaveChat={panel.ChatMessages.length > 0 && !panel.IsStreaming}
        saveChatTip={saveChatTip}
        showColumnDialog={showColumnDialog}
        showFilterSelectDialog={showFilterSelectDialog}
        onSaveChat={handleSaveChat}
        onToggleColumnDialog={handleToggleColumnDialog}
        onToggleFilterSelectDialog={handleToggleFilterSelectDialog}
        onClearTodoSelection={() => handleSelectTodoMemo('')}
        onRefresh={handleRefresh}
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
          hiddenFields={['type']}
          onClose={() => setShowFilterSelectDialog(false)}
        />
      )}

      {/* ── コンテンツ ───────────────────────────────────────── */}
      <div className="rethink-area__chat">
        {viewMode === 'settings' ? (
          <div style={{ padding: '16px', fontSize: 'calc(12px * var(--tt-font-scale, 1))', color: 'var(--text-muted)', position: 'relative' }}>
            <input ref={settingsCheckRef} type="checkbox" aria-hidden="true"
              style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
            ReThink設定は今後追加予定です。
          </div>
        ) : (
          <>
            {supportListError && <p role="alert">{supportListError}</p>}
            <ThinktankChatMemoPicker
              thinks={todoMemoThinks}
              columns={columns}
              sort={sort}
              filterVisibility={filterVisibility}
              selectedId={selectedTodoMemoId}
              onSelect={handleSelectTodoMemo}
              checkedIds={panel.CheckedThoughtIDs}
              onToggleCheck={(id, force) => panel.ToggleCheck(id, force)}
            />
            <div className="rethink-area__chat-body">
              <SupportChat ref={reThinkChatRef} vault={vault} panelName="ReThink"
                selectedId={selectedTodoMemoId} onSelected={setSelectedTodoMemoId} bundleId={app.OverviewPanel.BundleID}
                onMessages={msgs => panel.LoadChat(msgs)} onWaiting={value => panel.SetStreaming(value)}
                modelSelector={{ value: { provider: panel.AIChatProvider, model: panel.AIChatModel }, onChange: selection => panel.SetAIChatModel(selection) }} />
            </div>
          </>
        )}
      </div>

    </div>
  );
}
