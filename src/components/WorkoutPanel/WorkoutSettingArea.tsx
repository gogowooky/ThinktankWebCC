/**
 * WorkoutSettingArea.tsx
 */

import { useState, useRef, useImperativeHandle, forwardRef, useCallback, useMemo, useEffect } from 'react';
import {
  GalleryThumbnails,
  PanelLeftDashed,
  PanelRightDashed,
  PanelTopDashed,
  PanelBottomDashed,
  SquareX,
  CopyX,
  LibraryBig,
  ChevronsLeftRightEllipsis,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileSpreadsheet,
  Save,
  ArrowDownAZ,
  LayoutList,
  ListRestart,
} from 'lucide-react';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import type { SettingsType } from './WorkoutTabBar';
import { WORKOUT_SETTINGS } from './WorkoutTabBar';
import { AiChatView } from '../ThinktankPanel/AiChatView';
import type { AiChatViewRef } from '../ThinktankPanel/AiChatView';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import { FilterSelectDialog, DEFAULT_CHAT_FILTER_VISIBILITY } from '../ThinktankPanel/FilterSelectDialog';
import type { FilterVisibility } from '../ThinktankPanel/FilterSelectDialog';
import { ThinktankChatMemoPicker } from '../ThinktankPanel/ThinktankChatMemoPicker';
import type { ChatMessage } from '../../types';
import { streamChat } from '../../services/ChatApiService';
import { aiSpeakerPrefix } from '../../services/aiModels';
import {
  serializeChat, isTodoChatThink, loadChatFromThink,
  NEW_CHAT_SENTINEL_ID, TODO_CHAT_PREFIX_WORKOUT,
} from '../../utils/thinkFormat';
import { FOLDING_HEADER_STATUS_ID, LINK_STYLE_STATUS_IDS, isUnset, parseAttrs, styleStatusId } from '../../utils/defaultColor';
import './WorkoutSettingArea.css';

/**
 * 「文字設定」の先頭に並べるエディタの基本色。値の実体は docs/DefaultColor.md の
 * 各StatusID（TextEditor.Text / .Selection / .Occurrence / .FoldingHeader）で、
 * ここでは Color / BgColor だけを扱う（Attrs のUIは持たない）。
 *
 * 文字色を持つのは基本（TextEditor.Text）だけ。
 * 　選択 … Monaco は選択中の文字色（editor.selectionForeground）を高コントラストテーマでしか適用しない
 * 　出現 … Monaco の wordHighlight に前景色のテーマ項目がない
 * 　折畳 … 折り畳まれた行の文字はその行本来のスタイル（見出し等）のままにする
 */
const TEXT_EDITOR_BASE_COLORS: {
  statusId: string;
  label:    string;
  hasColor: boolean;
}[][] = [
  // 配列1つが1行。基本｜選択 / 出現｜折畳 の2列に並べる
  [
    { statusId: 'TextEditor.Text',       label: '基本', hasColor: true  },
    { statusId: 'TextEditor.Selection',  label: '選択', hasColor: false },
  ],
  [
    { statusId: 'TextEditor.Occurrence',  label: '出現', hasColor: false },
    { statusId: FOLDING_HEADER_STATUS_ID, label: '折畳', hasColor: false },
  ],
];

/**
 * 「タグ色」に並べる Url / Filepath / Tag のスタイル。
 * 値の実体は docs/DefaultColor.md の TextEditor.<種別>.Style.* で、
 * TextEditor.CurrentEditor.DoOnCursorPos が認識する要素と同じもの。
 */
const TEXT_EDITOR_TAG_COLORS: { statusId: string; label: string }[] = [
  { statusId: LINK_STYLE_STATUS_IDS.url,      label: 'URL' },
  { statusId: LINK_STYLE_STATUS_IDS.filepath, label: 'パス' },
  { statusId: LINK_STYLE_STATUS_IDS.tag,      label: 'タグ' },
];

// ── 方向アイコン ──────────────────────────────────────────────────────────

type Dir = 'right' | 'left' | 'up' | 'down';

function SplitIcon({ dir }: { dir: Dir }) {
  switch (dir) {
    case 'left': return <PanelRightDashed size={16} className="ws-icon" />;
    case 'right': return <PanelLeftDashed size={16} className="ws-icon" />;
    case 'up': return <PanelBottomDashed size={16} className="ws-icon" />;
    case 'down': return <PanelTopDashed size={16} className="ws-icon" />;
  }
}

function AddIcon({ dir }: { dir: Dir }) {
  let transform = '';
  switch (dir) {
    case 'left': transform = 'rotate(-90deg)'; break;
    case 'right': transform = 'rotate(90deg)'; break;
    case 'up': transform = 'none'; break;
    case 'down': transform = 'rotate(180deg)'; break;
  }
  return <GalleryThumbnails size={16} className="ws-icon" style={{ transform }} />;
}

// ── Ref ─────────────────────────────────────────────────────────────────

export interface WorkoutSettingAreaRef { focus: () => void; }

// ── Props ────────────────────────────────────────────────────────────────

interface Props {
  activeSettings:   SettingsType;
  panel:            TTWorkoutPanel;
  vault:            TTVault;
  width:            number;
  onSplitLeft:      () => void;
  onSplitRight:     () => void;
  onSplitAbove:     () => void;
  onSplitBelow:     () => void;
  onAddLeft:        () => void;
  onAddRight:       () => void;
  onAddTop:         () => void;
  onAddBottom:      () => void;
  onRemoveFocused:  () => void;
  onClearAll:       () => void;
  onCloseNotInBundle: () => void;
  hasBundle:        boolean;
  onEqualizeWidths: () => void;
  onEqualizeHeights:() => void;
  onCreateMemo:     () => void;
  onReadMemo:       () => void;
  onSaveMemo:       () => void;
  onCreateTable:    () => void;
  onReadTable:      () => void;
  onSaveTable:      () => void;
  /** chatファイル未選択時の保存。作成した Think を返す（続けて選択中として扱うため） */
  onSaveChat:       (messages: ChatMessage[]) => Promise<TTThink | undefined>;
  onRefresh:        () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export const WorkoutSettingArea = forwardRef<WorkoutSettingAreaRef, Props>(function WorkoutSettingArea({
  activeSettings, panel, vault, width,
  onSplitLeft, onSplitRight, onSplitAbove, onSplitBelow,
  onAddLeft, onAddRight, onAddTop, onAddBottom,
  onRemoveFocused, onClearAll, onCloseNotInBundle, hasBundle, onEqualizeWidths, onEqualizeHeights,
  onCreateMemo, onReadMemo, onSaveMemo,
  onCreateTable, onReadTable, onSaveTable,
  onSaveChat, onRefresh,
}: Props, ref) {
  const panelRef           = useRef<HTMLDivElement>(null);
  const firstWorkoutRef    = useRef<HTMLButtonElement>(null);
  const firstTexteditorRef = useRef<HTMLInputElement>(null);
  const firstDatagridRef   = useRef<HTMLButtonElement>(null);
  const aiChatViewRef      = useRef<AiChatViewRef>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      switch (activeSettings) {
        case 'workout':
          // disabled の可能性があるためフォーカスできなければパネル自体へ
          if (firstWorkoutRef.current && !firstWorkoutRef.current.disabled) {
            firstWorkoutRef.current.focus();
          } else {
            panelRef.current?.focus();
          }
          break;
        case 'texteditor': firstTexteditorRef.current?.focus(); break;
        case 'datagrid':   firstDatagridRef.current?.focus();   break;
        case 'chat':       aiChatViewRef.current?.focus();      break;
        default:           panelRef.current?.focus();           break;
      }
    },
  }));

  // ── AI相談チャット state ───────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatWaiting,  setChatWaiting]  = useState(false);
  const chatAbortRef                    = useRef<AbortController | null>(null);
  const chatAccumulatedRef              = useRef('');
  const [selectedTodoMemoId, setSelectedTodoMemoId] = useState('');
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,    setSort]    = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>(DEFAULT_CHAT_FILTER_VISIBILITY);
  const [showFilterSelectDialog, setShowFilterSelectDialog] = useState(false);

  // AI相談 DataGrid 用: タイトルが TODO:Workout で始まる chat Think 一覧（Vault全体）
  const todoMemoThinks = useMemo(
    () => vault.GetThinks().filter(t => isTodoChatThink(t, TODO_CHAT_PREFIX_WORKOUT)),
    [vault, vault.Count], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 選択中の TODO メモが一覧から消えたら選択を空に戻す
  useEffect(() => {
    if (selectedTodoMemoId && !todoMemoThinks.some(t => t.ID === selectedTodoMemoId)) {
      setSelectedTodoMemoId('');
    }
  }, [todoMemoThinks, selectedTodoMemoId]);

  const handleChatSend = useCallback(async (text: string) => {
    const ts = new Date().toISOString();
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: ts };
    const aiId = `a-${Date.now() + 1}`;
    // AI発言はどのモデルの回答かが本文に残るよう「(モデル名)」の1行で始める
    const aiPrefix = aiSpeakerPrefix({ provider: panel.AIChatProvider, model: panel.AIChatModel });
    const aiMsg: ChatMessage   = { id: aiId, role: 'assistant', content: aiPrefix, timestamp: new Date().toISOString() };

    setChatMessages(prev => [...prev, userMsg, aiMsg]);
    setChatWaiting(true);
    chatAccumulatedRef.current = aiPrefix;

    chatAbortRef.current = new AbortController();

    const history = [...chatMessages, userMsg].map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }));

    await streamChat(
      history,
      'あなたは Thinktank の AI アシスタントである Antigravity です。ユーザーの Think（メモ・アイデア）の整理や分析を日本語で手伝ってください。',
      {
        onDelta: (delta) => {
          chatAccumulatedRef.current += delta;
          const accumulated = chatAccumulatedRef.current;
          setChatMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: accumulated } : m));
        },
        onDone:  () => setChatWaiting(false),
        onError: (message) => {
          setChatMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, content: `${aiPrefix}[エラー] ${message}` } : m,
          ));
          setChatWaiting(false);
        },
      },
      chatAbortRef.current.signal,
      { provider: panel.AIChatProvider, model: panel.AIChatModel },
    );
  }, [chatMessages, panel]);

  // 選択中のchatファイルがあればそこへ上書き保存、なければ新規の chat Think として保存する
  const handleSaveChat = useCallback(async () => {
    if (chatMessages.length === 0 || chatWaiting) return;

    if (selectedTodoMemoId) {
      const think = vault.GetThink(selectedTodoMemoId);
      if (!think) return;
      const firstLine = think.Content.split('\n')[0] ?? '';
      const body = serializeChat(chatMessages);
      think.Content = firstLine ? `${firstLine}\n${body}` : body;
      await think.SaveContent();
      return;
    }

    const think = await onSaveChat(chatMessages);
    if (think) setSelectedTodoMemoId(think.ID);
  }, [chatMessages, chatWaiting, onSaveChat, selectedTodoMemoId, vault]);

  const saveChatTip = selectedTodoMemoId
    ? `Chatを${selectedTodoMemoId}に保管します`
    : 'Chatを新規のchatとして保管します';

  // chatファイル選択: 選択されたchatファイルの内容をChatにロードする（空選択でクリア）。
  // 「新規チャット」行が選ばれた場合もファイルは作らず、空選択と同じ「未保存の新規チャット」状態にする。
  // ファイルとして保存されるのは、保存ボタンが押された時（handleSaveChat）だけ
  const handleSelectTodoMemo = useCallback(async (id: string) => {
    chatAbortRef.current?.abort();
    setChatWaiting(false);

    const targetId = id === NEW_CHAT_SENTINEL_ID ? '' : id;
    setSelectedTodoMemoId(targetId);
    if (!targetId) { setChatMessages([]); return; }
    const think = vault.GetThink(targetId);
    if (think?.IsMetaOnly) await think.LoadContent();
    setChatMessages(loadChatFromThink(think));
  }, [vault]);

  const handleToggleColumnDialog = useCallback(() => setShowColumnDialog(v => !v), []);
  const handleToggleFilterSelectDialog = useCallback(() => setShowFilterSelectDialog(v => !v), []);

  const hasFocus  = panel.Layout !== null;
  const entry     = WORKOUT_SETTINGS.find(s => s.type === activeSettings);
  const panelName = entry?.name ?? '';

  const [isAreaSettingsOpen,      setIsAreaSettingsOpen]      = useState(true);
  const [isDisplaySettingsOpen,   setIsDisplaySettingsOpen]   = useState(true);
  const [isColorSettingsOpen,     setIsColorSettingsOpen]     = useState(true);
  const [isTagColorOpen,          setIsTagColorOpen]          = useState(true);
  const [isHighlightColorOpen,    setIsHighlightColorOpen]    = useState(true);
  const [isMemoSettingsOpen,      setIsMemoSettingsOpen]      = useState(true);
  const [isTableSettingsOpen,     setIsTableSettingsOpen]     = useState(true);

  return (
    <div ref={panelRef} className="workout-setting-area" style={{ width }} tabIndex={-1}>

      <div className="workout-setting-area__header">Workout&gt;{panelName}</div>

      <div className={`workout-setting-area__body${activeSettings === 'chat' ? ' workout-setting-area__body--chat' : ''}`}>
        {activeSettings === 'chat' ? (
          <div className="workout-setting-area__chat">
            <div className="workout-setting-area__chat-toolbar">
              <button
                className="workout-setting-area__chat-btn"
                onClick={handleSaveChat}
                disabled={chatMessages.length === 0 || chatWaiting}
                data-tip={saveChatTip}
              >
                <Save size={14} className="ws-icon" />
              </button>

              <div className="workout-setting-area__chat-sep" />

              <button
                className="workout-setting-area__chat-btn"
                onClick={onRefresh}
                data-tip="表示更新"
              >
                <ListRestart size={14} className="ws-icon" />
              </button>
              <button
                className={`workout-setting-area__chat-btn${showColumnDialog ? ' workout-setting-area__chat-btn--active' : ''}`}
                onClick={handleToggleColumnDialog}
                data-tip="表示項目とソート"
              >
                <ArrowDownAZ size={14} className="ws-icon" />
              </button>
              <button
                className={`workout-setting-area__chat-btn${showFilterSelectDialog ? ' workout-setting-area__chat-btn--active' : ''}`}
                onClick={handleToggleFilterSelectDialog}
                data-tip="フィルター選択"
              >
                <LayoutList size={14} className="ws-icon" />
              </button>
              <button
                className="workout-setting-area__chat-btn"
                onClick={() => handleSelectTodoMemo('')}
                data-tip="アイテム選択をクリア"
              >
                <SquareX size={14} className="ws-icon" />
              </button>
            </div>

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
            <div className="workout-setting-area__chat-body">
              <AiChatView
                ref={aiChatViewRef}
                messages={chatMessages}
                isWaiting={chatWaiting}
                onSend={handleChatSend}
                modelSelector={{
                  value:    { provider: panel.AIChatProvider, model: panel.AIChatModel },
                  onChange: (selection) => panel.SetAIChatModel(selection),
                }}
              />
            </div>
          </div>
        ) : activeSettings === 'workout' ? (
          <>
            {/* エリア管理 */}
            <div className="workout-setting-area__section">
              <div 
                className="workout-setting-area__section-header"
                onClick={() => setIsAreaSettingsOpen(!isAreaSettingsOpen)}
              >
                {isAreaSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-area__section-label" style={{ marginBottom: 0 }}>エリア</span>
              </div>
              
              {isAreaSettingsOpen && (
                <div className="workout-setting-area__section-content">
                  {/* 分割 */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>分割</span>
                    <div className="workout-setting-area__icon-row" style={{ flex: 1 }}>
                      <div className="tooltip-wrapper" data-tip="左に分割して新Pane追加">
                        <button
                          ref={firstWorkoutRef}
                          className="workout-setting-area__icon-btn"
                          onClick={hasFocus ? onSplitLeft : undefined}
                          disabled={!hasFocus}
                        >
                          <SplitIcon dir="left" />
                        </button>
                      </div>
                      <div className="tooltip-wrapper" data-tip="右に分割して新Pane追加">
                        <button
                          className="workout-setting-area__icon-btn"
                          onClick={hasFocus ? onSplitRight : undefined}
                          disabled={!hasFocus}
                        >
                          <SplitIcon dir="right" />
                        </button>
                      </div>
                      <div className="tooltip-wrapper" data-tip="上に分割して新Pane追加">
                        <button
                          className="workout-setting-area__icon-btn"
                          onClick={hasFocus ? onSplitAbove : undefined}
                          disabled={!hasFocus}
                        >
                          <SplitIcon dir="up" />
                        </button>
                      </div>
                      <div className="tooltip-wrapper" data-tip="下に分割して新Pane追加">
                        <button
                          className="workout-setting-area__icon-btn"
                          onClick={hasFocus ? onSplitBelow : undefined}
                          disabled={!hasFocus}
                        >
                          <SplitIcon dir="down" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 追加 */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>追加</span>
                    <div className="workout-setting-area__icon-row" style={{ flex: 1 }}>
                      <button
                        className="workout-setting-area__icon-btn"
                        onClick={onAddLeft}
                        data-tip="左端に追加"
                      >
                        <AddIcon dir="left" />
                      </button>
                      <button
                        className="workout-setting-area__icon-btn"
                        onClick={onAddRight}
                        data-tip="右端に追加"
                      >
                        <AddIcon dir="right" />
                      </button>
                      <button
                        className="workout-setting-area__icon-btn"
                        onClick={onAddTop}
                        data-tip="上端に追加"
                      >
                        <AddIcon dir="up" />
                      </button>
                      <button
                        className="workout-setting-area__icon-btn"
                        onClick={onAddBottom}
                        data-tip="下端に追加"
                      >
                        <AddIcon dir="down" />
                      </button>
                    </div>
                  </div>

                  {/* 消去 */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>消去</span>
                    <div className="workout-setting-area__icon-row" style={{ flex: 1 }}>
                      <div className="tooltip-wrapper" data-tip="フォーカスペインを消去">
                        <button
                          className="workout-setting-area__icon-btn workout-setting-area__icon-btn--danger"
                          onClick={hasFocus ? onRemoveFocused : undefined}
                          disabled={!hasFocus}
                        >
                          <SquareX size={16} className="ws-icon" />
                        </button>
                      </div>
                      <button
                        className="workout-setting-area__icon-btn workout-setting-area__icon-btn--danger"
                        onClick={onClearAll}
                        data-tip="すべてのペインを全消去"
                      >
                        <CopyX size={16} className="ws-icon" />
                      </button>
                      <div className="tooltip-wrapper" data-tip="選択中BundleにないPaneをすべて消去">
                        <button
                          className="workout-setting-area__icon-btn workout-setting-area__icon-btn--danger"
                          onClick={hasBundle ? onCloseNotInBundle : undefined}
                          disabled={!hasBundle}
                        >
                          <LibraryBig size={16} className="ws-icon" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 均等 */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>均等</span>
                    <div className="workout-setting-area__icon-row" style={{ flex: 1 }}>
                      <div className="tooltip-wrapper" data-tip="幅を均等化">
                        <button
                          className="workout-setting-area__icon-btn"
                          onClick={hasFocus ? onEqualizeWidths : undefined}
                          disabled={!hasFocus}
                        >
                          <ChevronsLeftRightEllipsis size={16} className="ws-icon" />
                        </button>
                      </div>
                      <div className="tooltip-wrapper" data-tip="高さを均等化">
                        <button
                          className="workout-setting-area__icon-btn"
                          onClick={hasFocus ? onEqualizeHeights : undefined}
                          disabled={!hasFocus}
                        >
                          <ChevronsLeftRightEllipsis size={16} className="ws-icon" style={{ transform: 'rotate(90deg)' }} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : activeSettings === 'texteditor' ? (
          <>
            <div className="workout-setting-area__section">
              <div 
                className="workout-setting-area__section-header"
                onClick={() => setIsDisplaySettingsOpen(!isDisplaySettingsOpen)}
              >
                {isDisplaySettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-area__section-label" style={{ marginBottom: 0 }}>表示設定</span>
              </div>
              
              {isDisplaySettingsOpen && (
                <div className="workout-setting-area__section-content">
                  <label className="workout-setting-area__checkbox-label">
                    <input
                      ref={firstTexteditorRef}
                      type="checkbox"
                      checked={panel.TextEditor.LineNumbers.IsVisible}
                      onChange={e => panel.SetTextEditorLineNumbersVisible(e.target.checked)}
                    />
                    <span className="workout-setting-area__checkbox-text">行番号</span>
                  </label>

                  <label className="workout-setting-area__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.TextEditor.WordWrap.IsVisible}
                      onChange={e => panel.SetTextEditorWordWrapVisible(e.target.checked)}
                    />
                    <span className="workout-setting-area__checkbox-text">Wordwrap</span>
                  </label>

                  <label className="workout-setting-area__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.TextEditor.Minimap.IsVisible}
                      onChange={e => panel.SetTextEditorMinimapVisible(e.target.checked)}
                    />
                    <span className="workout-setting-area__checkbox-text">ミニマップ</span>
                  </label>

                  <label className="workout-setting-area__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.TextEditor.FullWidthSpace.IsVisible}
                      onChange={e => panel.SetTextEditorFullWidthSpaceVisible(e.target.checked)}
                    />
                    <span className="workout-setting-area__checkbox-text">全角スペース</span>
                  </label>

                  <label className="workout-setting-area__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.TextEditor.UnicodeHighlight.IsVisible}
                      onChange={e => panel.SetTextEditorUnicodeHighlightVisible(e.target.checked)}
                    />
                    <span className="workout-setting-area__checkbox-text">特殊文字警告</span>
                  </label>

                  <label className="workout-setting-area__checkbox-label">
                    <input
                      type="checkbox"
                      checked={panel.TextEditor.BracketPairColorization.IsVisible}
                      onChange={e => panel.SetTextEditorBracketPairColorizationVisible(e.target.checked)}
                    />
                    <span className="workout-setting-area__checkbox-text">括弧対応</span>
                  </label>
                </div>
              )}
            </div>
            <div className="workout-setting-area__divider" />

            <div className="workout-setting-area__section">
              <div 
                className="workout-setting-area__section-header"
                onClick={() => setIsColorSettingsOpen(!isColorSettingsOpen)}
              >
                {isColorSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-area__section-label" style={{ marginBottom: 0 }}>文字設定</span>
              </div>

              {isColorSettingsOpen && (
                <div className="workout-setting-area__section-content">
                  {/* エディタの基本色。docs/DefaultColor.md の各StatusIDを直接編集する（Attrs は扱わない）*/}
                  {TEXT_EDITOR_BASE_COLORS.map((row, rowIndex) => (
                    <div key={rowIndex} className="workout-setting-area__color-row">
                      {row.map(({ statusId, label, hasColor }) => {
                        const style = panel.GetColorStatus(statusId);
                        return (
                          <div key={statusId} className="workout-setting-area__color-cell">
                            <span className="workout-setting-area__color-label">{label}</span>
                            {hasColor && (
                              <input
                                type="color"
                                className="workout-setting-area__color-picker"
                                value={isUnset(style.Color) ? '#000000' : style.Color.slice(0, 7)}
                                onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
                                data-tip={`${label}の文字色`}
                              />
                            )}
                            <input
                              type="color"
                              className="workout-setting-area__color-picker"
                              value={isUnset(style.BgColor) ? '#ffffff' : style.BgColor.slice(0, 7)}
                              onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
                              data-tip={`${label}の背景色`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {[1, 2, 3, 4, 5, 6].map(level => {
                    const statusId = styleStatusId('Heading', level);
                    const style = panel.GetColorStatus(statusId);
                    const fw = ['１', '２', '３', '４', '５', '６'][level - 1];
                    const attrs = parseAttrs(style.Attrs);
                    const hasBg = !isUnset(style.BgColor);
                    return (
                      <div key={level} className="workout-setting-area__heading-style-row">
                        <span className="workout-setting-area__heading-style-label">セクション{fw}</span>
                        <input
                          type="color"
                          className="workout-setting-area__color-picker"
                          value={isUnset(style.Color) ? '#000000' : style.Color.slice(0, 7)}
                          onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
                          data-tip={`セクション${fw}の文字色`}
                        />
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={attrs.has('bold')}
                            onChange={e => panel.ToggleColorStatusAttr(statusId, 'bold', e.target.checked)}
                          />
                          B
                        </label>
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={attrs.has('underline')}
                            onChange={e => panel.ToggleColorStatusAttr(statusId, 'underline', e.target.checked)}
                          />
                          U
                        </label>
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={hasBg}
                            onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.checked ? '#ffffff' : 'undefined')}
                          />
                          BG
                        </label>
                        {hasBg && (
                          <input
                            type="color"
                            className="workout-setting-area__color-picker"
                            value={style.BgColor.slice(0, 7)}
                            onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
                            data-tip={`セクション${fw}の背景色`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="workout-setting-area__divider" />

            {/* タグ色設定（Url / Filepath / Tag）*/}
            <div className="workout-setting-area__section">
              <div
                className="workout-setting-area__section-header"
                onClick={() => setIsTagColorOpen(!isTagColorOpen)}
              >
                {isTagColorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-area__section-label" style={{ marginBottom: 0 }}>タグ色</span>
              </div>

              {isTagColorOpen && (
                <div className="workout-setting-area__section-content">
                  {TEXT_EDITOR_TAG_COLORS.map(({ statusId, label }) => {
                    const style = panel.GetColorStatus(statusId);
                    const attrs = parseAttrs(style.Attrs);
                    const hasBg = !isUnset(style.BgColor);
                    return (
                      <div key={statusId} className="workout-setting-area__heading-style-row">
                        <span className="workout-setting-area__heading-style-label">{label}</span>
                        <input
                          type="color"
                          className="workout-setting-area__color-picker"
                          value={isUnset(style.Color) ? '#000000' : style.Color.slice(0, 7)}
                          onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
                          data-tip={`${label}の文字色`}
                        />
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={attrs.has('bold')}
                            onChange={e => panel.ToggleColorStatusAttr(statusId, 'bold', e.target.checked)}
                          />
                          B
                        </label>
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={attrs.has('underline')}
                            onChange={e => panel.ToggleColorStatusAttr(statusId, 'underline', e.target.checked)}
                          />
                          U
                        </label>
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={hasBg}
                            onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.checked ? '#ffffff' : 'undefined')}
                          />
                          BG
                        </label>
                        {hasBg && (
                          <input
                            type="color"
                            className="workout-setting-area__color-picker"
                            value={style.BgColor.slice(0, 7)}
                            onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
                            data-tip={`${label}の背景色`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="workout-setting-area__divider" />

            {/* ハイライトグループ色設定 */}
            <div className="workout-setting-area__section">
              <div
                className="workout-setting-area__section-header"
                onClick={() => setIsHighlightColorOpen(!isHighlightColorOpen)}
              >
                {isHighlightColorOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-area__section-label" style={{ marginBottom: 0 }}>ハイライト色</span>
              </div>

              {isHighlightColorOpen && (
                <div className="workout-setting-area__section-content">
                  {[1, 2, 3, 4, 5, 6].map(group => {
                    const statusId = styleStatusId('Highlighter', group);
                    const style = panel.GetColorStatus(statusId);
                    const fw = ['１', '２', '３', '４', '５', '６'][group - 1];
                    const attrs = parseAttrs(style.Attrs);
                    const hasBg = !isUnset(style.BgColor);
                    const hasFg = !isUnset(style.Color);
                    return (
                      <div key={group} className="workout-setting-area__color-row" style={{ gap: '4px' }}>
                        <span className="workout-setting-area__color-label" style={{ minWidth: '50px' }}>グループ{fw}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                          <label className="workout-setting-area__small-checkbox">
                            <input
                              type="checkbox"
                              checked={hasBg}
                              onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.checked ? '#ffffff' : 'undefined')}
                            />
                            BG
                          </label>
                          {hasBg && (
                            <input
                              type="color"
                              className="workout-setting-area__color-picker"
                              value={style.BgColor.slice(0, 7)}
                              onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
                              data-tip={`グループ${fw}の背景色`}
                            />
                          )}

                          <label className="workout-setting-area__small-checkbox">
                            <input
                              type="checkbox"
                              checked={hasFg}
                              onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.checked ? '#000000' : 'undefined')}
                            />
                            FG
                          </label>
                          {hasFg && (
                            <input
                              type="color"
                              className="workout-setting-area__color-picker"
                              value={style.Color.slice(0, 7)}
                              onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
                              data-tip={`グループ${fw}の文字色`}
                            />
                          )}

                          <label className="workout-setting-area__small-checkbox">
                            <input
                              type="checkbox"
                              checked={attrs.has('bold')}
                              onChange={e => panel.ToggleColorStatusAttr(statusId, 'bold', e.target.checked)}
                            />
                            B
                          </label>
                          <label className="workout-setting-area__small-checkbox">
                            <input
                              type="checkbox"
                              checked={attrs.has('underline')}
                              onChange={e => panel.ToggleColorStatusAttr(statusId, 'underline', e.target.checked)}
                            />
                            U
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="workout-setting-area__divider" />

            {/* メモ操作 */}
            <div className="workout-setting-area__section">
              <div
                className="workout-setting-area__section-header"
                onClick={() => setIsMemoSettingsOpen(!isMemoSettingsOpen)}
              >
                {isMemoSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-area__section-label" style={{ marginBottom: 0 }}>メモ</span>
              </div>

              {isMemoSettingsOpen && (
                <div className="workout-setting-area__section-content">
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>新規</span>
                    <button
                      className="workout-setting-area__icon-btn"
                      onClick={onCreateMemo}
                      data-tip="新規メモファイルを作成"
                    >
                      <FilePlus size={16} className="ws-icon" />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>読取</span>
                    <button
                      className="workout-setting-area__icon-btn"
                      onClick={onReadMemo}
                      data-tip="txt / md / xdoc を読み取って新規メモを作成"
                    >
                      <FileSpreadsheet size={16} className="ws-icon" />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>保存</span>
                    <button
                      className="workout-setting-area__icon-btn"
                      onClick={onSaveMemo}
                      data-tip="表示中のメモを .md ファイルで保存"
                    >
                      <Save size={16} className="ws-icon" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : activeSettings === 'datagrid' ? (
          <>
            <div className="workout-setting-area__section">
              <div
                className="workout-setting-area__section-header"
                onClick={() => setIsTableSettingsOpen(!isTableSettingsOpen)}
              >
                {isTableSettingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="workout-setting-area__section-label" style={{ marginBottom: 0 }}>テーブル</span>
              </div>

              {isTableSettingsOpen && (
                <div className="workout-setting-area__section-content">
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>新規</span>
                    <button
                      ref={firstDatagridRef}
                      className="workout-setting-area__icon-btn"
                      onClick={onCreateTable}
                      data-tip="新規テーブルファイルを作成"
                    >
                      <FilePlus size={16} className="ws-icon" />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>読取</span>
                    <button
                      className="workout-setting-area__icon-btn"
                      onClick={onReadTable}
                      data-tip="CSV / XLSX を読み取って新規テーブルを作成"
                    >
                      <FileSpreadsheet size={16} className="ws-icon" />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '28px', flexShrink: 0 }}>保存</span>
                    <button
                      className="workout-setting-area__icon-btn"
                      onClick={onSaveTable}
                      data-tip="表示中のテーブルデータを CSV で保存"
                    >
                      <Save size={16} className="ws-icon" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="workout-setting-area__placeholder">
            {panelName} の設定は今後追加予定です。
          </div>
        )}
      </div>

    </div>
  );
});
