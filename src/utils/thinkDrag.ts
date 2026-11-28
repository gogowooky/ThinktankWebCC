/**
 * src/utils/thinkDrag.ts
 * Think一覧の行の D&D データと、検索条件欄へ落としたときに入る値。
 *
 * dataTransfer の中身は drop まで読めず、dragover ではゴーストに出す値を作れない。
 * そのため、ドラッグ中の Think の内容を同じ画面内でも覚えておく。
 */
import type { TTThink } from '../models/TTThink';
import { toLocalDate } from './localDateTime';

export const THINK_DRAG_TYPE = 'application/x-thought-id';

export type ThinkDropField = 'title' | 'createdDate' | 'updatedDate' | 'content';

export interface DraggedThink {
  id: string;
  title: string;
  updatedAt: string;
}

let dragged: DraggedThink | null = null;

export function beginThinkDrag(dataTransfer: DataTransfer, think: TTThink): void {
  // 'copy'のみだとOSによってはAlt修飾（Insert用）でのドロップ受理が
  // 不安定になることがあるため、'link'も許可しておく
  dataTransfer.effectAllowed = 'copyLink';
  dataTransfer.setData(THINK_DRAG_TYPE, think.ID);
  dragged = { id: think.ID, title: think.Name, updatedAt: think.UpdatedAt };
}

export function endThinkDrag(): void {
  dragged = null;
}

export function isThinkDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(THINK_DRAG_TYPE);
}

export function getDraggedThink(): DraggedThink | null {
  return dragged;
}

/** 日付欄（input type="date"）は yyyy-MM-dd しか保持できない */
function toDateInputValue(value: string): string {
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : '';
}

/** 検索条件欄に入る値。その欄の条件にできない Think では空文字 */
export function thinkDropValue(field: ThinkDropField, think: DraggedThink): string {
  switch (field) {
    case 'title':       return think.title.trim();
    case 'createdDate': return toDateInputValue(think.id);
    case 'updatedDate': return toDateInputValue(toLocalDate(think.updatedAt || think.id));
    case 'content':     return think.id;
  }
}
