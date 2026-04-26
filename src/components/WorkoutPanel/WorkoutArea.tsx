/**
 * WorkoutArea.tsx
 * 個別 WorkoutArea コンポーネント（Ribbon + コンテンツ）。
 *
 * Phase 8 で実際のメディアコンポーネントを差し込む。
 */

import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { MediaType } from '../../types';
import { WorkoutAreaRibbon } from './WorkoutAreaRibbon';
import './WorkoutArea.css';

const MEDIA_LABELS: Record<MediaType, string> = {
  texteditor: 'TextEditor（Phase 8）',
  markdown:   'Markdown（Phase 8）',
  datagrid:   'DataGrid（Phase 8）',
  card:       'Card（Phase 8）',
  graph:      'Graph（Phase 8）',
  chat:       'Chat（Phase 8）',
};

interface Props {
  area:              TTWorkoutArea;
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
  area,
  isFocused,
  isDragging,
  isDropTarget,
  onFocus,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onMediaTypeChange,
  onClose,
}: Props) {
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
        onDragStart={e => onDragStart(e, area.ID)}
        onMediaTypeChange={type => onMediaTypeChange(area.ID, type)}
        onClose={() => onClose(area.ID)}
      />

      {/* コンテンツ（Phase 8 でメディアコンポーネントに差し替え）*/}
      <div className="workout-area__content">
        <div className="workout-area__placeholder">
          <div className="workout-area__placeholder-media">
            {MEDIA_LABELS[area.MediaType]}
          </div>
          {area.ResourceID && (
            <div className="workout-area__placeholder-id">
              ID: {area.ResourceID}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
