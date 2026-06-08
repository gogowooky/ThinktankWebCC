/**
 * WorkoutArea.tsx
 * 個別 WorkoutArea コンポーネント（Ribbon + メディアコンテンツ）。
 *
 * - vault.GetThink(area.ResourceID) で対象 Think を取得
 * - area.MediaType に応じて適切なメディアコンポーネントを描画
 * - TextEditorMedia の dirty 状態を WorkoutMenuRibbon の ● 表示に連携
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { TTVault } from '../../models/TTVault';
import type { MediaType } from '../../types';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { WorkoutMenuRibbon, extractLinkDrop } from './WorkoutMenuRibbon';
import { TextEditorMedia } from './media/TextEditorMedia';
import { appendLinkToContent } from '../../utils/thinkFormat';
import type { TextEditorMediaRef } from './media/TextEditorMedia';
import { MarkdownMedia }   from './media/MarkdownMedia';
import type { MarkdownMediaRef }   from './media/MarkdownMedia';
import { DataGridMedia }   from './media/DataGridMedia';
import type { DataGridMediaRef }   from './media/DataGridMedia';
import { CardMedia }       from './media/CardMedia';
import type { CardMediaRef }       from './media/CardMedia';
import { GraphMedia }      from './media/GraphMedia';
import type { GraphMediaRef }      from './media/GraphMedia';
import { ChatMedia }       from './media/ChatMedia';
import type { ChatMediaRef }       from './media/ChatMedia';

type AnyMediaRef = TextEditorMediaRef | MarkdownMediaRef | DataGridMediaRef | CardMediaRef | GraphMediaRef | ChatMediaRef;
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { TTShortcutManager } from '../../views/TTShortcutManager';
import './WorkoutArea.css';

interface Props {
  area:              TTWorkoutArea;
  vault:             TTVault;
  isFocused:         boolean;
  isDragging:        boolean;
  isDropTarget:      boolean;
  isExternalDrag:    boolean;
  onFocus:           () => void;
  onDragStart:       (e: React.MouseEvent, areaId: string) => void;
  onDragEnter:       (areaId: string) => void;
  onDragLeave:       () => void;
  onMediaTypeChange: (areaId: string, type: MediaType) => void;
  onClose:           (areaId: string) => void;
}

export function WorkoutArea({
  area, vault, isFocused, isDragging, isDropTarget, isExternalDrag,
  onFocus, onDragStart, onDragEnter, onDragLeave, onMediaTypeChange, onClose,
}: Props) {
  const [isDirty,         setIsDirty]         = useState(false);
  const [loadedResourceId, setLoadedResourceId] = useState<string | null>(null);
  const autoSaveRef = useRef<(() => void) | null>(null);
  const mediaRef = useRef<AnyMediaRef | null>(null);
  const contentReady = loadedResourceId === area.ResourceID;

  const panel = area._parent as import('../../views/TTWorkoutPanel').TTWorkoutPanel;

  useEffect(() => {
    area.IsDirty = isDirty;
  }, [area, isDirty]);

  useEffect(() => {
    setIsDirty(false);
    const t = vault.GetThink(area.ResourceID);
    if (!t || !t.IsMetaOnly) {
      setLoadedResourceId(area.ResourceID);
      return;
    }
    t.LoadContent().then(() => setLoadedResourceId(area.ResourceID));
  }, [area.ResourceID]); // eslint-disable-line react-hooks/exhaustive-deps

  // タイトルへの URL/path D&D → 常に新規 links Think を作成して表示
  const handleUrlDrop = useCallback(async (url: string, title: string) => {
    const newThink = await vault.CreateLinksThink(title, url);
    area.OpenThink(newThink.ID, 'texteditor', newThink.Name);
  }, [vault, area]);

  // コンテンツ領域への URL/path D&D（links ペインのみ）→ 追記
  const [isContentLinkDrop, setIsContentLinkDrop] = useState(false);
  const [contentRefreshKey, setContentRefreshKey] = useState(0);

  // キャプチャフェーズで処理: links ペイン上の URL/path ドロップを Monaco より先に捕捉する
  const handleContentDragOver = useCallback((e: React.DragEvent) => {
    const current = vault.GetThink(area.ResourceID);
    if (current?.ContentType !== 'links') return;
    const types = e.dataTransfer.types;
    if (!types.includes('text/uri-list') && !types.includes('Files') && !types.includes('text/plain')) return;
    e.preventDefault();
    e.stopPropagation(); // Monaco に渡さない
    e.dataTransfer.dropEffect = 'copy';
    setIsContentLinkDrop(true);
  }, [vault, area.ResourceID]);

  const handleContentDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsContentLinkDrop(false);
  }, []);

  const handleContentDrop = useCallback(async (e: React.DragEvent) => {
    const current = vault.GetThink(area.ResourceID);
    if (current?.ContentType !== 'links') return;
    const link = extractLinkDrop(e);
    if (!link) return;
    e.preventDefault();
    e.stopPropagation(); // TextEditorMedia / Monaco に渡さない
    setIsContentLinkDrop(false);
    current.Content = appendLinkToContent(current.Content, link);
    await current.SaveContent();
    setContentRefreshKey(k => k + 1);
  }, [vault, area.ResourceID]);

  // タイトルへのD&Dで表示内容を差し替える
  const handleResourceDrop = useCallback((thinkId: string) => {
    const think = vault.GetThink(thinkId);
    let mediaType: import('../../types').MediaType = 'texteditor';
    if (think) {
      switch (think.ContentType) {
        case 'thought': mediaType = 'datagrid'; break;
        case 'table':   mediaType = 'datagrid'; break;
        case 'chat':    mediaType = 'chat';     break;
        default:        mediaType = 'texteditor'; break;
      }
    }
    const title = think?.Name ?? thinkId;
    area.OpenThink(thinkId, mediaType, title);
  }, [vault, area]);

  // 保存ハンドラー（TextEditorMedia から Ctrl+S で呼ばれる）
  const handleSave = useCallback((content: string) => {
    const think = vault.GetThink(area.ResourceID);
    if (!think) return;
    think.Content = content;
    // タイトル行が変わっていればペインタイトルも更新
    if (area.Title !== think.Name) {
      area.Title = think.Name;
      panel.NotifyUpdated();
    }
    think.SaveContent().then(() => {
      setIsDirty(false);
      // システム Think の保存を各マネージャーに通知
      TTUIStateManager.instance.onThinkSaved(think.ID, content);
      TTShortcutManager.instance.onThinkSaved(think.ID, content);
    }).catch(e => {
      console.error('[WorkoutArea] SaveContent failed:', e);
    });
  }, [vault, area.ResourceID, area, panel]);

  // リアルタイムタイトル同期（thought / table の第一行編集時）
  const handleTitleChange = useCallback((title: string) => {
    const think = vault.GetThink(area.ResourceID);
    if (!think) return;
    think.Name  = title;
    area.Title  = title;
    panel.NotifyUpdated();
  }, [vault, area, panel]);


  useEffect(() => {
    if (!isFocused) return;
    const timer = setTimeout(() => mediaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isFocused]);

  // メディアタイプ切り替え時に対応する入力要素へフォーカス
  useEffect(() => {
    const timer = setTimeout(() => mediaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [area.MediaType]);

  // think データ取得
  const think = vault.GetThink(area.ResourceID) ?? null;
  useAppUpdate(panel);

  const editorSettings = useMemo(() => ({
    lineNumbers:   panel?.TextEditor.LineNumbers.IsVisible ?? false,
    wordWrap:      panel?.TextEditor.WordWrap.IsVisible ?? true,
    minimap:       panel?.TextEditor.Minimap.IsVisible ?? false,
    showFullWidthSpace: panel?.TextEditor.FullWidthSpace.IsVisible ?? false,
    unicodeHighlight: panel?.TextEditor.UnicodeHighlight.IsVisible ?? false,
    bracketPairColorization: panel?.TextEditor.BracketPairColorization.IsVisible ?? true,
    highlightWord: panel?.HighlightWord ?? '',
    highlightStyles: panel?.TextEditor.HighlightStyles ?? [
      { backgroundColor: '#ffff00', color: '#000000' },
      { backgroundColor: '#ff0000', color: '#ffffff' },
      { backgroundColor: '#0000ff', color: '#ffffff' },
      { backgroundColor: '#008000', color: '#ffffff' },
      { backgroundColor: '#800080', color: '#ffffff' },
    ],
    background:          panel?.TextEditor.Color.Background  ?? '#f5f5f5',
    foreground:          panel?.TextEditor.Color.Text        ?? '#1e1e1e',
    selectionBackground: panel?.TextEditor.Color.Selection   ?? '#c6e6c6ff',
    occurrenceBackground: panel?.TextEditor.Color.Occurrence ?? '#aac6aaff',
    headingStyles: panel?.TextEditor.HeadingStyles ?? [
      { color: '#569cd6', bold: true, underline: false },
      { color: '#4ec9b0', bold: true, underline: false },
      { color: '#ce9178', bold: true, underline: false },
      { color: '#dcdcaa', bold: true, underline: false },
      { color: '#c586c0', bold: true, underline: false },
    ],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [panel?.TextEditor.LineNumbers.IsVisible, panel?.TextEditor.WordWrap.IsVisible, panel?.TextEditor.Minimap.IsVisible,
       panel?.TextEditor.FullWidthSpace.IsVisible, panel?.TextEditor.UnicodeHighlight.IsVisible,
       panel?.TextEditor.BracketPairColorization.IsVisible, panel?.HighlightWord,
       panel?.TextEditor.HighlightStyles,
       panel?.TextEditor.Color.Background, panel?.TextEditor.Color.Text,
       panel?.TextEditor.Color.Selection, panel?.TextEditor.Color.Occurrence,
       panel?.TextEditor.HeadingStyles]);

  const mediaProps = { think, vault, onSave: handleSave, onDirtyChange: setIsDirty, onTitleChange: handleTitleChange, editorSettings, refreshKey: contentRefreshKey, autoSaveRef };

  // MediaType → コンポーネント切り替え
  const renderMedia = () => {
    switch (area.MediaType) {
      case 'workout':    return <TextEditorMedia ref={mediaRef as React.Ref<TextEditorMediaRef>} {...mediaProps} />;
      case 'texteditor': return <TextEditorMedia ref={mediaRef as React.Ref<TextEditorMediaRef>} {...mediaProps} />;
      case 'markdown':   return <MarkdownMedia   ref={mediaRef as React.Ref<MarkdownMediaRef>}   {...mediaProps} />;
      case 'datagrid':   return <DataGridMedia   ref={mediaRef as React.Ref<DataGridMediaRef>}   {...mediaProps} />;
      case 'card':       return <CardMedia       ref={mediaRef as React.Ref<CardMediaRef>}       {...mediaProps} />;
      case 'graph':      return <GraphMedia      ref={mediaRef as React.Ref<GraphMediaRef>}      {...mediaProps} />;
      case 'chat':       return <ChatMedia       ref={mediaRef as React.Ref<ChatMediaRef>}       {...mediaProps} />;
    }
  };

  const handleDragStart    = useCallback((e: React.MouseEvent) => onDragStart(e, area.ID),      [onDragStart, area.ID]);
  const handleMediaChange  = useCallback((type: MediaType) => {
    // TextEditor から離れるとき、未保存の内容を自動保存する（isDirty 不問、内部で差分チェック）
    if (area.MediaType === 'texteditor' || area.MediaType === 'workout') {
      autoSaveRef.current?.();
    }
    onMediaTypeChange(area.ID, type);
  }, [area.MediaType, area.ID, onMediaTypeChange]);
  const handleClose        = useCallback(()                     => onClose(area.ID),              [onClose, area.ID]);
  const handleDragEnter    = useCallback(()                     => onDragEnter(area.ID),           [onDragEnter, area.ID]);

  const className = [
    'workout-area',
    isFocused    && 'workout-area--focused',
    isDragging   && 'workout-area--dragging',
    isDropTarget && 'workout-area--drop-target',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      data-area-id={area.ID}
      onMouseDown={onFocus}
      onMouseEnter={handleDragEnter}
      onMouseLeave={onDragLeave}
    >
      <WorkoutMenuRibbon
        area={area}
        contentType={think?.ContentType}
        isFocused={isFocused}
        isDirty={isDirty}
        onDragStart={handleDragStart}
        onMediaTypeChange={handleMediaChange}
        onClose={handleClose}
        onResourceDrop={handleResourceDrop}
        onUrlDrop={handleUrlDrop}
      />

      {/* メディアコンテンツ */}
      <div
        className="workout-area__content"
        data-media-type={area.MediaType}
        onDragOverCapture={handleContentDragOver}
        onDragLeaveCapture={handleContentDragLeave}
        onDropCapture={handleContentDrop}
      >
        {contentReady
          ? renderMedia()
          : <div className="workout-area__loading">読み込み中…</div>
        }
        {/* Monaco の dragover 横取りを防ぐシールド */}
        {isExternalDrag && (
          <div style={{
            position: 'absolute', inset: 0,
            zIndex: 10, pointerEvents: 'auto',
          }} />
        )}
        {/* links ペインへのリンク追記ドロップオーバーレイ */}
        {isContentLinkDrop && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
            background: 'rgba(80, 200, 120, 0.15)',
            border: '2px dashed rgba(80, 200, 120, 0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'rgba(80,200,120,0.9)', fontSize: 12, fontWeight: 600 }}>リンクを追記</span>
          </div>
        )}
      </div>

    </div>
  );
}
