import { useEffect, useState } from 'react';
import {
  THINK_DRAG_TYPE, endThinkDrag, getDraggedThink, isThinkDrag, thinkDropValue, type ThinkDropField,
} from '../../utils/thinkDrag';
import { useNativeDragCleanup } from '../WorkingPanel/useNativeDragCleanup';

interface ThinkFieldDropProps {
  'data-think-drop-field': ThinkDropField;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

/** 検索条件欄の行で Think の D&D を受ける。ghost は Drop したときに入る値（受けていない間は空文字） */
export function useThinkFieldDrop(
  field: ThinkDropField,
  onDropValue: (value: string) => void,
): { ghost: string; dropProps: ThinkFieldDropProps } {
  const [ghost, setGhost] = useState('');
  // ドラッグ元の行が仮想スクロールで外れると dragend が届かないため、Pane のゴーストと同じ後始末を使う
  useNativeDragCleanup(() => setGhost(''));

  const currentValue = () => {
    const think = getDraggedThink();
    return think ? thinkDropValue(field, think) : '';
  };

  return {
    ghost,
    dropProps: {
      'data-think-drop-field': field,
      onDragOver: e => {
        // 文字列など Think 以外の D&D は input の既定動作に任せる
        if (!isThinkDrag(e.dataTransfer)) return;
        e.preventDefault();
        // 親へ伝えると SeedsPanel の project への追加・切替になる
        e.stopPropagation();
        const value = currentValue();
        e.dataTransfer.dropEffect = value ? 'copy' : 'none';
        setGhost(value);
      },
      onDragLeave: e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGhost('');
      },
      onDrop: e => {
        if (!isThinkDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        setGhost('');
        const value = currentValue();
        // 別ウィンドウからのドラッグなど、覚えている Think と違うものは取り込まない
        const isSameThink = getDraggedThink()?.id === e.dataTransfer.getData(THINK_DRAG_TYPE);
        endThinkDrag();
        if (value && isSameThink) onDropValue(value);
      },
    },
  };
}

/**
 * 値を差し込んだうえで、Enter を押したときと同じ確定処理を行う。
 * 確定処理は親が持つ現在値を読むため、差し込んだ値で描画し直されてから呼ぶ。
 */
export function useConfirmAfterChange(
  value: string,
  onChange: (value: string) => void,
  onConfirm: (() => void) | undefined,
): (value: string) => void {
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (pending === null) return;
    setPending(null);
    if (value === pending) onConfirm?.();
  }, [pending, value, onConfirm]);
  return next => { onChange(next); setPending(next); };
}
