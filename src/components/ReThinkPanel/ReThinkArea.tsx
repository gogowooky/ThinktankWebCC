/**
 * ReThinkArea.tsx
 * Phase 10: ReThinkPanel のメインエリア。
 *
 * - メモ選択(DataGrid) + ReThinkChat（AI との CLI ターミナル風チャット）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { ReThinkChat } from './ReThinkChat';
import type { ReThinkChatRef } from './ReThinkChat';
import { ReThinkMenuRibbon } from './ReThinkMenuRibbon';
import type { ReThinkViewMode } from './ReThinkTabBar';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import { FilterSelectDialog, DEFAULT_CHAT_FILTER_VISIBILITY } from '../ThinktankPanel/FilterSelectDialog';
import type { FilterVisibility } from '../ThinktankPanel/FilterSelectDialog';
import { ThinktankChatMemoPicker } from '../ThinktankPanel/ThinktankChatMemoPicker';
import { serializeChat, isTodoThink, loadChatFromThink, TODO_MEMO_PREFIX_RETHINK } from '../../utils/thinkFormat';
import '../../components/Layout/MenuRibbon.css';
import './ReThinkArea.css';

const RETHINK_MODE_NAMES: Record<ReThinkViewMode, string> = {
  chat:     'AI相談',
  settings: '設定',
};

const BASE_SYSTEM_PROMPT =
  'あなたは Thinktank という知識管理アプリのAIアシスタントです。' +
  'ユーザーの Think（メモ・アイデア）や Bundle（テーマ集合）について、' +
  '整理・分析・次のアクションの提案などを日本語で丁寧に行ってください。';

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
  const reThinkChatRef     = useRef<ReThinkChatRef>(null);
  const settingsCheckRef   = useRef<HTMLInputElement>(null);
  const [selectedTodoMemoId, setSelectedTodoMemoId] = useState('');
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,    setSort]    = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>(DEFAULT_CHAT_FILTER_VISIBILITY);
  const [showFilterSelectDialog, setShowFilterSelectDialog] = useState(false);

  // AI相談 DataGrid 用: タイトルが [todo:rethink] で始まる Think 一覧（Vault全体・種別不問）
  const overviewBundleId = app.OverviewPanel.BundleID;
  const todoMemoThinks = useMemo(
    () => vault.GetThinks().filter(t => isTodoThink(t, TODO_MEMO_PREFIX_RETHINK)),
    [vault, vault.Count], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 選択中の TODO メモが一覧から消えたら選択を空に戻す
  useEffect(() => {
    if (selectedTodoMemoId && !todoMemoThinks.some(t => t.ID === selectedTodoMemoId)) {
      setSelectedTodoMemoId('');
    }
  }, [todoMemoThinks, selectedTodoMemoId]);

  const handleToggleColumnDialog = useCallback(() => setShowColumnDialog(v => !v), []);
  const handleToggleFilterSelectDialog = useCallback(() => setShowFilterSelectDialog(v => !v), []);
  const handleRefresh = useCallback(() => {
    app.RefreshAll().catch(e => console.error('[ReThinkArea] RefreshAll failed:', e));
  }, [app]);
  const handleOpenInWorkout = useCallback((id: string) => {
    app.OpenThinkInWorkout(id);
  }, [app]);

  // モード切り替え時に対応する入力要素へフォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewMode === 'chat')     reThinkChatRef.current?.focus();
      if (viewMode === 'settings') settingsCheckRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode]);

  // 表示中メモがあればそのメモへ上書き保存、なければ新規メモとして保存する（Overviewの選択中Bundleへリンク）
  const handleSaveChat = useCallback(async () => {
    const msgs = panel.ChatMessages;
    if (msgs.length === 0) return;

    if (selectedTodoMemoId) {
      const think = vault.GetThink(selectedTodoMemoId);
      if (!think) return;
      const firstLine = think.Content.split('\n')[0] ?? '';
      const body = serializeChat(msgs);
      think.Content = firstLine ? `${firstLine}\n${body}` : body;
      await think.SaveContent();
      return;
    }

    const firstUser = msgs.find(m => m.role === 'user')?.content ?? '';
    const title = firstUser.slice(0, 50) || `Chat ${new Date().toLocaleDateString('ja-JP')}`;
    const body  = serializeChat(msgs);
    await vault.CreateBlankThink('memo', `${title}\n${body}`, overviewBundleId || undefined);
    panel.ClearChat();
  }, [panel, vault, selectedTodoMemoId, overviewBundleId]);

  const saveChatTip = selectedTodoMemoId
    ? `Chatをメモ:${selectedTodoMemoId}に保管します`
    : 'Chatをメモに保管します';

  // TODOメモ選択: 選択されたmemoファイルの内容をChatにロードする（空選択でクリア）
  const handleSelectTodoMemo = useCallback(async (id: string) => {
    setSelectedTodoMemoId(id);
    reThinkChatRef.current?.abortStreaming();
    if (!id) { panel.LoadChat([]); return; }
    const think = vault.GetThink(id);
    if (think?.IsMetaOnly) await think.LoadContent();
    panel.LoadChat(loadChatFromThink(think));
  }, [panel, vault]);

  const systemPrompt = useMemo(() => {
    const parts: string[] = [BASE_SYSTEM_PROMPT];

    if (panel.LinkedBundleID) {
      const bundle = vault.GetThink(panel.LinkedBundleID);
      if (bundle) {
        parts.push(`\n## 連携中の Bundle\nタイトル: ${bundle.Name}`);
        const thinks = vault.GetThinksForBundle(panel.LinkedBundleID);
        if (thinks.length > 0) {
          parts.push(
            '含まれる Think（関連アイデア）:\n' +
            thinks.map(t => `- ${t.Name}`).join('\n'),
          );
        }
      }
    } else if (panel.LinkedThinkID) {
      const think = vault.GetThink(panel.LinkedThinkID);
      if (think) {
        parts.push(
          `\n## 連携中の Think\nタイトル: ${think.Name}` +
          (think.Content ? `\n内容:\n${think.Content.slice(0, 2000)}` : ''),
        );
      }
    }

    return parts.join('\n');
  }, [panel.LinkedBundleID, panel.LinkedThinkID, vault]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', position: 'relative' }}>
            <input ref={settingsCheckRef} type="checkbox" aria-hidden="true"
              style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
            ReThink設定は今後追加予定です。
          </div>
        ) : (
          <>
            <ThinktankChatMemoPicker
              thinks={todoMemoThinks}
              columns={columns}
              sort={sort}
              filterVisibility={filterVisibility}
              selectedId={selectedTodoMemoId}
              onSelect={handleSelectTodoMemo}
              onOpenInWorkout={handleOpenInWorkout}
            />
            <div className="rethink-area__chat-body">
              <ReThinkChat ref={reThinkChatRef} panel={panel} systemPrompt={systemPrompt} />
            </div>
          </>
        )}
      </div>

    </div>
  );
}
