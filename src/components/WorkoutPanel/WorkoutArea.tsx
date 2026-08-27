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
import type { AiModelSelection } from '../../services/aiModels';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { useHighlight } from '../../contexts/HighlightContext';
import { WorkoutMenuRibbon, extractLinkDrop, shouldAllowLocalDrop } from './WorkoutMenuRibbon';
import { TextEditorMedia } from './media/TextEditorMedia';
import { appendLinkToContent } from '../../utils/thinkFormat';
import { FOLDING_HEADER_STATUS_ID, isUnset, pickColorStyle, pickIndexedStyles, pickInlineStyles, pickLinkStyles, pickMarkStyles } from '../../utils/defaultColor';
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
import { TTActions } from '../../views/TTActions';
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

    // 読み込み中に別Thinkが開かれた場合、遅れて完了したロードで
    // 「読み込み済み」にしてしまわないよう、この実行が担当するIDを固定する
    const targetId = area.ResourceID;
    let cancelled = false;

    const loadAndRestore = async () => {
      const t = vault.GetThink(targetId);
      if (!t) {
        if (!vault.IsLoaded) {
          const updateKey = `WorkoutArea-load-${area.ID}`;
          vault.AddOnUpdate(updateKey, () => {
            if (vault.IsLoaded) {
              vault.RemoveOnUpdate(updateKey);
              loadAndRestore();
            }
          });
        } else if (!cancelled) {
          setLoadedResourceId(targetId);
        }
        return;
      }

      if (t.IsMetaOnly) {
        await t.LoadContent();
      }
      if (cancelled) return;
      setLoadedResourceId(targetId);

      // ハイライト文字の復元
      if (t.Metadata?.highlightWord !== undefined) {
        panel.SetHighlightWord(t.Metadata.highlightWord);
      }
    };

    loadAndRestore();

    return () => {
      cancelled = true;
      vault.RemoveOnUpdate(`WorkoutArea-load-${area.ID}`);
    };
  }, [area.ResourceID, vault, panel]);

  // ハイライト文字が変更されたら、フォーカスされているペインの think.Metadata に同期する
  useEffect(() => {
    if (isFocused && area.ResourceID) {
      const t = vault.GetThink(area.ResourceID);
      if (t) {
        if (!t.Metadata) t.Metadata = {};
        if (t.Metadata.highlightWord !== panel.HighlightWord) {
          t.Metadata.highlightWord = panel.HighlightWord;
        }
      }
    }
  }, [panel.HighlightWord, isFocused, area.ResourceID, vault]);

  // Ctrl+S での強制保存を WorkoutArea 全体でハンドリング
  useEffect(() => {
    const handleGlobalSave = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const currentThink = vault.GetThink(area.ResourceID);
        if (currentThink) {
          e.preventDefault();
          // メタデータだけでも強制保存
          currentThink.SaveContent(true).then(() => {
            setIsDirty(false);
          }).catch(err => {
            console.error('[WorkoutArea] Global Ctrl+S metadata save failed:', err);
          });
        }
      }
    };
    window.addEventListener('keydown', handleGlobalSave);
    return () => window.removeEventListener('keydown', handleGlobalSave);
  }, [vault, area.ResourceID]);

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
    if (!link || !shouldAllowLocalDrop(e)) return;
    e.preventDefault();
    e.stopPropagation(); // TextEditorMedia / Monaco に渡さない
    setIsContentLinkDrop(false);
    current.Content = appendLinkToContent(current.Content, link);
    await current.SaveContent();
    setContentRefreshKey(k => k + 1);
  }, [vault, area.ResourceID]);

  // タイトルへのThinkドロップ: Alt修飾の有無で Load（Pane差し替え）/ Insert（タグ挿入）を
  // 振り分ける。疑似キー ThinkFileDrag の解決・実行は TTShortcutManager + TTActions
  // （WorkoutPanel.DroppedFile.ID:Load / WorkoutPanel.DroppedFile.ID:Insert、docs/DefaultShortcut.md参照）
  // に委ねる。Insert時はこのペインのエディタを対象にするため、実行前に activeEditor を
  // このペインのエディタへ同期する（editorがないメディア種別ではInsertは無効）。
  const handleThinkFileDrop = useCallback((thinkId: string, e: React.DragEvent) => {
    const actionId = TTShortcutManager.instance.resolveDragAction('ThinkFileDrag', e.nativeEvent);
    if (!actionId) return;
    if (actionId === 'WorkoutPanel.DroppedFile.ID:Insert') {
      const ref = mediaRef.current;
      const editor = ref && 'getEditor' in ref ? ref.getEditor() : null;
      if (!editor) return;
      TTShortcutManager.instance.setActiveEditor(editor);
      TTShortcutManager.instance.setPendingThinkDrop({ thinkId, kind: 'insert' });
      TTActions.Execute('WorkoutPanel.DroppedFile.ID:Insert');
      return;
    }
    TTShortcutManager.instance.setPendingThinkDrop({ thinkId, kind: 'load-replace', areaId: area.ID });
    TTActions.Execute('WorkoutPanel.DroppedFile.ID:Load');
  }, [area.ID]);

  // 保存ハンドラー（TextEditorMedia から Ctrl+S・自動保存で呼ばれる）
  // 保存先は content の出所（thinkId）に固定する。area.ResourceID を参照すると、
  // 遅延保存がペインの表示切替をまたいだときに別ファイルを上書きしてしまう。
  const handleSave = useCallback((content: string, thinkId?: string) => {
    const targetId = thinkId ?? area.ResourceID;
    const think = vault.GetThink(targetId);
    if (!think) return Promise.resolve();
    think.Content = content;

    const isCurrentResource = targetId === area.ResourceID;
    // タイトル行が変わっていればペインタイトルも更新（表示中のThinkのみ）
    if (isCurrentResource && area.Title !== think.Name) {
      area.Title = think.Name;
      panel.NotifyUpdated();
    }
    return think.SaveContent().then(() => {
      if (isCurrentResource) setIsDirty(false);
      // システム Think の保存を各マネージャーに通知
      TTUIStateManager.instance.onThinkSaved(think.ID, content);
      TTShortcutManager.instance.onThinkSaved(think.ID, content);
    }).catch(e => {
      console.error('[WorkoutArea] SaveContent failed:', e);
      throw e;
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

  // OverviewPanel.Bundle.ID が設定されていて、かつそのBundleに記載されていないThinkを表示中か
  const { overviewBundleIds, overviewIncludedIds } = useHighlight();
  const isOutsideBundle = overviewBundleIds.length > 0
    && !!area.ResourceID
    && !overviewIncludedIds.includes(area.ResourceID);

  const editorSettings = useMemo(() => {
    // Bullet / Comment は行頭記号（TextEditor.<種別>.Marks）と色・属性（DefaultColor.md）を突き合わせる
    const bulletStyles  = pickMarkStyles('Bullet',  panel?.TextEditor.Bullet.Marks,  panel?.TextEditor.ColorStatus);
    const commentStyles = pickMarkStyles('Comment', panel?.TextEditor.Comment.Marks, panel?.TextEditor.ColorStatus);

    // エディタの基本色。Monaco のテーマには必ず値を渡す必要があるため、
    // DefaultColor.md 側が無設定のときだけ最終フォールバックを当てる。
    const textStyle       = pickColorStyle('TextEditor.Text',       panel?.TextEditor.ColorStatus);
    const selectionStyle  = pickColorStyle('TextEditor.Selection',  panel?.TextEditor.ColorStatus);
    const occurrenceStyle = pickColorStyle('TextEditor.Occurrence', panel?.TextEditor.ColorStatus);
    const colorOr = (value: string, fallback: string) => (isUnset(value) ? fallback : value);

    return {
      lineNumbers:   panel?.TextEditor.LineNumbers.IsVisible ?? false,
      wordWrap:      panel?.TextEditor.WordWrap.IsVisible ?? true,
      minimap:       panel?.TextEditor.Minimap.IsVisible ?? false,
      showFullWidthSpace: panel?.TextEditor.FullWidthSpace.IsVisible ?? false,
      unicodeHighlight: panel?.TextEditor.UnicodeHighlight.IsVisible ?? false,
      bracketPairColorization: panel?.TextEditor.BracketPairColorization.IsVisible ?? true,
      highlightWord: panel?.HighlightWord ?? '',
      highlightStyles: pickIndexedStyles('Highlighter', panel?.TextEditor.ColorStatus),
      background:           colorOr(textStyle.BgColor,       '#f5f5f5'),
      foreground:           colorOr(textStyle.Color,         '#1e1e1e'),
      selectionBackground:  colorOr(selectionStyle.BgColor,  '#cba8ff'),
      occurrenceBackground: colorOr(occurrenceStyle.BgColor, '#ccffdd'),
      headingStyles:   pickIndexedStyles('Heading',     panel?.TextEditor.ColorStatus),
      commentStyles,
      bulletStyles,
      linkStyles:          pickLinkStyles(panel?.TextEditor.ColorStatus),
      inlineStyles:        pickInlineStyles(panel?.TextEditor.ColorStatus),
      foldingHeaderStyle:  pickColorStyle(FOLDING_HEADER_STATUS_ID, panel?.TextEditor.ColorStatus),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel?.TextEditor.LineNumbers.IsVisible, panel?.TextEditor.WordWrap.IsVisible, panel?.TextEditor.Minimap.IsVisible,
       panel?.TextEditor.FullWidthSpace.IsVisible, panel?.TextEditor.UnicodeHighlight.IsVisible,
       panel?.TextEditor.BracketPairColorization.IsVisible, panel?.HighlightWord,
       panel?.TextEditor.ColorStatus,
       panel?.TextEditor.Bullet.Marks, panel?.TextEditor.Comment.Marks]);

  // AI Chat のモデルは panel 単位で1つ。Pane の Chat と WorkoutSetting の AI相談 が同じ値を見る
  const aiChatModel = { provider: panel.AIChatProvider, model: panel.AIChatModel };
  const handleAiChatModelChange = (selection: AiModelSelection) => panel.SetAIChatModel(selection);

  const mediaProps = { areaId: area.ID, think, vault, onSave: handleSave, onDirtyChange: setIsDirty, onTitleChange: handleTitleChange, editorSettings, refreshKey: contentRefreshKey, autoSaveRef, aiChatModel, onAiChatModelChange: handleAiChatModelChange };

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
      tabIndex={-1}
      onMouseDown={onFocus}
      onMouseEnter={handleDragEnter}
      onMouseLeave={onDragLeave}
    >
      <WorkoutMenuRibbon
        area={area}
        contentType={think?.ContentType}
        isFocused={isFocused}
        isDirty={isDirty}
        isOutsideBundle={isOutsideBundle}
        onDragStart={handleDragStart}
        onMediaTypeChange={handleMediaChange}
        onClose={handleClose}
        onResourceDrop={handleThinkFileDrop}
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
            <span style={{ color: 'rgba(80,200,120,0.9)', fontSize: 'calc(12px * var(--tt-font-scale, 1))', fontWeight: 600 }}>リンクを追記</span>
          </div>
        )}
      </div>

    </div>
  );
}
