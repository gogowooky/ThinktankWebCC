/**
 * WorkoutArea.tsx
 * 個別 WorkoutArea コンポーネント（Ribbon + メディアコンテンツ）。
 *
 * - vault.GetThink(area.ResourceID) で対象 Think を取得
 * - area.MediaType に応じて適切なメディアコンポーネントを描画
 * - TextEditorMedia の dirty 状態を WorkoutAreaRibbon の ● 表示に連携
 */

import { useState, useCallback, useEffect } from 'react';
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { TTVault } from '../../models/TTVault';
import type { MediaType } from '../../types';
import { WorkoutAreaRibbon } from './WorkoutAreaRibbon';
import { TextEditorMedia } from './media/TextEditorMedia';
import { MarkdownMedia }   from './media/MarkdownMedia';
import { DataGridMedia }   from './media/DataGridMedia';
import { CardMedia }       from './media/CardMedia';
import { GraphMedia }      from './media/GraphMedia';
import { ChatMedia }       from './media/ChatMedia';
import './WorkoutArea.css';

interface Props {
  area:              TTWorkoutArea;
  vault:             TTVault;
  isFocused:         boolean;
  isDragging:        boolean;
  isDropTarget:      boolean;
  onFocus:           () => void;
  onDragStart:       (e: React.MouseEvent, areaId: string) => void;
  onDragEnter:       (areaId: string) => void;
  onDragLeave:       () => void;
  onMediaTypeChange: (areaId: string, type: MediaType) => void;
  onClose:           (areaId: string) => void;
}

export function WorkoutArea({
  area, vault, isFocused, isDragging, isDropTarget,
  onFocus, onDragStart, onDragEnter, onDragLeave, onMediaTypeChange, onClose,
}: Props) {
  const [isDirty,         setIsDirty]         = useState(false);
  const [loadedResourceId, setLoadedResourceId] = useState<string | null>(null);
  const contentReady = loadedResourceId === area.ResourceID;

  useEffect(() => {
    setIsDirty(false);
    const t = vault.GetThink(area.ResourceID);
    if (!t || !t.IsMetaOnly) {
      setLoadedResourceId(area.ResourceID);
      return;
    }
    t.LoadContent().then(() => setLoadedResourceId(area.ResourceID));
  }, [area.ResourceID]); // eslint-disable-line react-hooks/exhaustive-deps

  // 保存ハンドラー（TextEditorMedia から呼ばれる）
  const handleSave = useCallback((content: string) => {
    const think = vault.GetThink(area.ResourceID);
    if (!think) return;
    think.Content = content;
    think.markSaved();
    setIsDirty(false);
  }, [vault, area.ResourceID]);

  // think データ取得
  const think = vault.GetThink(area.ResourceID) ?? null;

  // メディア共通 props
  const panel = area._parent as import('../../views/TTWorkoutPanel').TTWorkoutPanel;
  const mediaProps = {
    think,
    vault,
    onSave: handleSave,
    onDirtyChange: setIsDirty,
    editorSettings: {
      lineNumbers:   panel?.EditorLineNumbers ?? true,
      wordWrap:      panel?.EditorWordWrap ?? true,
      minimap:       panel?.EditorMinimap ?? false,
      showFullWidthSpace: panel?.EditorShowFullWidthSpace ?? false,
      unicodeHighlight: panel?.EditorUnicodeHighlight ?? true,
      bracketPairColorization: panel?.EditorBracketPairColorization ?? true,
      highlightWord: panel?.EditorHighlightWord ?? '',
      highlightStyles: panel?.EditorHighlightStyles ?? [
        { backgroundColor: '#ffff00', color: '#000000' },
        { backgroundColor: '#ff0000', color: '#ffffff' },
        { backgroundColor: '#0000ff', color: '#ffffff' },
        { backgroundColor: '#008000', color: '#ffffff' },
        { backgroundColor: '#800080', color: '#ffffff' },
      ],
      background:    panel?.EditorBackground ?? '#1e1e1e',
      foreground:    panel?.EditorForeground ?? '#d4d4d4',
      headingStyles: panel?.EditorHeadingStyles ?? [
        { color: '#569cd6', bold: true, underline: false },
        { color: '#4ec9b0', bold: true, underline: false },
        { color: '#ce9178', bold: true, underline: false },
        { color: '#dcdcaa', bold: true, underline: false },
        { color: '#c586c0', bold: true, underline: false },
      ],
    }
  };

  // MediaType → コンポーネント切り替え
  const renderMedia = () => {
    switch (area.MediaType) {
      case 'workout':    return <TextEditorMedia {...mediaProps} />;
      case 'texteditor': return <TextEditorMedia {...mediaProps} />;
      case 'markdown':   return <MarkdownMedia   {...mediaProps} />;
      case 'datagrid':   return <DataGridMedia   {...mediaProps} />;
      case 'card':       return <CardMedia       {...mediaProps} />;
      case 'graph':      return <GraphMedia      {...mediaProps} />;
      case 'chat':       return <ChatMedia       {...mediaProps} />;
    }
  };

  return (
    <div
      className={[
        'workout-area',
        isFocused    ? 'workout-area--focused'     : '',
        isDragging   ? 'workout-area--dragging'    : '',
        isDropTarget ? 'workout-area--drop-target' : '',
      ].join(' ')}
      data-area-id={area.ID}
      onMouseDown={onFocus}
      onMouseEnter={() => onDragEnter(area.ID)}
      onMouseLeave={onDragLeave}
    >
      <WorkoutAreaRibbon
        area={area}
        isFocused={isFocused}
        isDirty={isDirty}
        onDragStart={e => onDragStart(e, area.ID)}
        onMediaTypeChange={type => onMediaTypeChange(area.ID, type)}
        onClose={() => onClose(area.ID)}
      />

      {/* メディアコンテンツ */}
      <div className="workout-area__content">
        {contentReady
          ? renderMedia()
          : <div className="workout-area__loading">読み込み中…</div>
        }
      </div>

    </div>
  );
}
