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
  const [isDirty,       setIsDirty]       = useState(false);
  const [contentReady,  setContentReady]  = useState(false);

  // ResourceID が変わったら dirty リセット & IsMetaOnly ならコンテンツをロード
  useEffect(() => {
    setIsDirty(false);
    setContentReady(false);
    const t = vault.GetThink(area.ResourceID);
    if (!t || !t.IsMetaOnly) {
      setContentReady(true);
      return;
    }
    t.LoadContent().then(() => setContentReady(true));
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
  const mediaProps = { think, vault, onSave: handleSave, onDirtyChange: setIsDirty };

  // MediaType → コンポーネント切り替え
  const renderMedia = () => {
    switch (area.MediaType) {
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
