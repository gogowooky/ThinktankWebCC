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
import { serializeChat, isTodoThink, loadChatFromThink, TODO_MEMO_PREFIX_WORKOUT } from '../../utils/thinkFormat';
import './WorkoutSettingArea.css';

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
  onEqualizeWidths: () => void;
  onEqualizeHeights:() => void;
  onCreateMemo:     () => void;
  onReadMemo:       () => void;
  onSaveMemo:       () => void;
  onCreateTable:    () => void;
  onReadTable:      () => void;
  onSaveTable:      () => void;
  onSaveChat:       (messages: ChatMessage[]) => Promise<void>;
  onRefresh:        () => void;
  onOpenInWorkout:  (id: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export const WorkoutSettingArea = forwardRef<WorkoutSettingAreaRef, Props>(function WorkoutSettingArea({
  activeSettings, panel, vault, width,
  onSplitLeft, onSplitRight, onSplitAbove, onSplitBelow,
  onAddLeft, onAddRight, onAddTop, onAddBottom,
  onRemoveFocused, onClearAll, onEqualizeWidths, onEqualizeHeights,
  onCreateMemo, onReadMemo, onSaveMemo,
  onCreateTable, onReadTable, onSaveTable,
  onSaveChat, onRefresh, onOpenInWorkout,
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

  // AI相談 DataGrid 用: タイトルが [todo:workout] で始まる Think 一覧（Vault全体・種別不問）
  const todoMemoThinks = useMemo(
    () => vault.GetThinks().filter(t => isTodoThink(t, TODO_MEMO_PREFIX_WORKOUT)),
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
    const aiMsg: ChatMessage   = { id: aiId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setChatMessages(prev => [...prev, userMsg, aiMsg]);
    setChatWaiting(true);
    chatAccumulatedRef.current = '';

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
            m.id === aiId ? { ...m, content: `[エラー] ${message}` } : m,
          ));
          setChatWaiting(false);
        },
      },
      chatAbortRef.current.signal,
      { provider: panel.AIChatProvider, model: panel.AIChatModel },
    );
  }, [chatMessages, panel]);

  // 表示中メモがあればそのメモへ上書き保存、なければ新規メモとして保存する
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

    await onSaveChat(chatMessages);
    setChatMessages([]);
  }, [chatMessages, chatWaiting, onSaveChat, selectedTodoMemoId, vault]);

  const saveChatTip = selectedTodoMemoId
    ? `Chatをメモ:${selectedTodoMemoId}に保管します`
    : 'Chatをメモに保管します';

  // TODOメモ選択: 選択されたmemoファイルの内容をChatにロードする（空選択でクリア）
  const handleSelectTodoMemo = useCallback(async (id: string) => {
    setSelectedTodoMemoId(id);
    chatAbortRef.current?.abort();
    setChatWaiting(false);
    if (!id) { setChatMessages([]); return; }
    const think = vault.GetThink(id);
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
              onOpenInWorkout={onOpenInWorkout}
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
                  <div className="workout-setting-area__color-row">
                    <span className="workout-setting-area__color-label">背景色</span>
                    <input
                      type="color"
                      className="workout-setting-area__color-picker"
                      value={panel.TextEditor.Color.Background.slice(0, 7)}
                      onChange={e => panel.SetTextEditorColorBackground(e.target.value)}
                    />
                  </div>

                  <div className="workout-setting-area__color-row">
                    <span className="workout-setting-area__color-label">文字色</span>
                    <input
                      type="color"
                      className="workout-setting-area__color-picker"
                      value={panel.TextEditor.Color.Text.slice(0, 7)}
                      onChange={e => panel.SetTextEditorColorText(e.target.value)}
                    />
                  </div>

                  <div className="workout-setting-area__color-row">
                    <span className="workout-setting-area__color-label">選択色</span>
                    <input
                      type="color"
                      className="workout-setting-area__color-picker"
                      value={panel.TextEditor.Color.Selection.slice(0, 7)}
                      onChange={e => panel.SetTextEditorColorSelection(e.target.value)}
                    />
                  </div>

                  <div className="workout-setting-area__color-row">
                    <span className="workout-setting-area__color-label">一致色</span>
                    <input
                      type="color"
                      className="workout-setting-area__color-picker"
                      value={panel.TextEditor.Color.Occurrence.slice(0, 7)}
                      onChange={e => panel.SetTextEditorColorOccurrence(e.target.value)}
                    />
                  </div>

                  {[1, 2, 3, 4, 5].map(level => {
                    const style = panel.TextEditor.HeadingStyles[level - 1];
                    const fw = ['１', '２', '３', '４', '５'][level - 1];
                    const hasBg = style.bgColor !== undefined && style.bgColor !== 'undefined';
                    return (
                      <div key={level} className="workout-setting-area__heading-style-row">
                        <span className="workout-setting-area__heading-style-label">セクション{fw}</span>
                        <input
                          type="color"
                          className="workout-setting-area__color-picker"
                          value={style.color}
                          onChange={e => panel.SetTextEditorHeadingStyle(level, { color: e.target.value })}
                          data-tip={`セクション${fw}の文字色`}
                        />
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={style.bold}
                            onChange={e => panel.SetTextEditorHeadingStyle(level, { bold: e.target.checked })}
                          />
                          B
                        </label>
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={style.underline}
                            onChange={e => panel.SetTextEditorHeadingStyle(level, { underline: e.target.checked })}
                          />
                          U
                        </label>
                        <label className="workout-setting-area__small-checkbox">
                          <input
                            type="checkbox"
                            checked={hasBg}
                            onChange={e => panel.SetTextEditorHeadingStyle(level, { bgColor: e.target.checked ? '#ffffff' : 'undefined' })}
                          />
                          BG
                        </label>
                        {hasBg && (
                          <input
                            type="color"
                            className="workout-setting-area__color-picker"
                            value={style.bgColor && style.bgColor !== 'undefined' ? style.bgColor.slice(0, 7) : '#ffffff'}
                            onChange={e => panel.SetTextEditorHeadingStyle(level, { bgColor: e.target.value })}
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
                    const style = panel.TextEditor.HighlightStyles[group - 1] || { backgroundColor: '#ffffff', color: 'undefined', bold: false, underline: false };
                    const fw = ['１', '２', '３', '４', '５', '６'][group - 1];
                    const hasBg = style.backgroundColor !== undefined && style.backgroundColor !== 'undefined';
                    const hasFg = style.color !== undefined && style.color !== 'undefined';
                    return (
                      <div key={group} className="workout-setting-area__color-row" style={{ flexWrap: 'wrap', gap: '4px' }}>
                        <span className="workout-setting-area__color-label" style={{ minWidth: '50px' }}>グループ{fw}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <label className="workout-setting-area__small-checkbox">
                            <input
                              type="checkbox"
                              checked={hasBg}
                              onChange={e => panel.SetTextEditorHighlightStyle(group - 1, { backgroundColor: e.target.checked ? '#ffffff' : 'undefined' })}
                            />
                            BG
                          </label>
                          {hasBg && (
                            <input
                              type="color"
                              className="workout-setting-area__color-picker"
                              value={style.backgroundColor.slice(0, 7)}
                              onChange={e => panel.SetTextEditorHighlightStyle(group - 1, { backgroundColor: e.target.value })}
                              data-tip={`グループ${fw}の背景色`}
                            />
                          )}
                          
                          <label className="workout-setting-area__small-checkbox">
                            <input
                              type="checkbox"
                              checked={hasFg}
                              onChange={e => panel.SetTextEditorHighlightStyle(group - 1, { color: e.target.checked ? '#000000' : 'undefined' })}
                            />
                            FG
                          </label>
                          {hasFg && (
                            <input
                              type="color"
                              className="workout-setting-area__color-picker"
                              value={style.color.slice(0, 7)}
                              onChange={e => panel.SetTextEditorHighlightStyle(group - 1, { color: e.target.value })}
                              data-tip={`グループ${fw}の文字色`}
                            />
                          )}

                          <label className="workout-setting-area__small-checkbox">
                            <input
                              type="checkbox"
                              checked={style.bold ?? false}
                              onChange={e => panel.SetTextEditorHighlightStyle(group - 1, { bold: e.target.checked })}
                            />
                            B
                          </label>
                          <label className="workout-setting-area__small-checkbox">
                            <input
                              type="checkbox"
                              checked={style.underline ?? false}
                              onChange={e => panel.SetTextEditorHighlightStyle(group - 1, { underline: e.target.checked })}
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
