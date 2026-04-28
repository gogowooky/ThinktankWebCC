/**
 * WorkoutAreaRibbon.tsx
 * WorkoutArea のリボンバー。
 *
 * 左から: [ドラッグハンドル] [タイトル] [MediaTypeボタン群] [閉じるボタン]
 * isFocused=true のとき青みがかった背景で強調表示。
 */

import { GripVertical, FileText, Eye, Table, LayoutGrid, Share2, MessageCircle, X, type LucideIcon } from 'lucide-react';
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { MediaType } from '../../types';
import './WorkoutAreaRibbon.css';

const MEDIA_BUTTONS: Array<{ type: MediaType; Icon: LucideIcon; title: string }> = [
  { type: 'texteditor',  Icon: FileText,       title: 'テキストエディタ' },
  { type: 'markdown',    Icon: Eye,            title: 'Markdown' },
  { type: 'datagrid',    Icon: Table,          title: 'テーブル' },
  { type: 'card',        Icon: LayoutGrid,     title: 'カード' },
  { type: 'graph',       Icon: Share2,         title: 'グラフ' },
  { type: 'chat',        Icon: MessageCircle,  title: 'チャット' },
];

interface Props {
  area:              TTWorkoutArea;
  isFocused:         boolean;
  isDirty?:          boolean;
  onDragStart:       (e: React.MouseEvent) => void;
  onMediaTypeChange: (type: MediaType) => void;
  onClose:           () => void;
}

export function WorkoutAreaRibbon({ area, isFocused, isDirty = false, onDragStart, onMediaTypeChange, onClose }: Props) {
  return (
    <div className={[
      'workout-area-ribbon',
      isFocused ? 'workout-area-ribbon--focused' : '',
    ].join(' ')}>

      {/* ドラッグハンドル */}
      <div
        className="workout-area-ribbon__drag"
        onMouseDown={onDragStart}
        title="ドラッグして移動"
      >
        <GripVertical size={13} />
      </div>

      {/* タイトル（未保存変更があれば ● を表示）*/}
      <span className="workout-area-ribbon__title" title={area.Title}>
        {isDirty && <span className="workout-area-ribbon__dirty">●</span>}
        {area.Title || '（無題）'}
      </span>

      {/* MediaType ボタン群 */}
      <div className="workout-area-ribbon__media">
        {MEDIA_BUTTONS.map(({ type, Icon, title }) => (
          <button
            key={type}
            className={`workout-area-ribbon__media-btn${area.MediaType === type ? ' workout-area-ribbon__media-btn--active' : ''}`}
            onClick={() => onMediaTypeChange(type)}
            title={title}
          >
            <Icon size={12} />
          </button>
        ))}
      </div>

      {/* 閉じるボタン */}
      <button
        className="workout-area-ribbon__close"
        onClick={onClose}
        title="閉じる"
      >
        <X size={12} />
      </button>
    </div>
  );
}
