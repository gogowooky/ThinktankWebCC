/**
 * sortUtils.ts
 * TTThink 一覧の共通ソート・日付フィルター処理。
 * ThinktankArea / OverviewArea の重複を排除する。
 */

import type { TTThink } from '../models/TTThink';
import type { SortConfig } from '../components/ThinktankPanel/ColumnSortDialog';
import { computeDateRange } from './dateUtils';

export interface DateFilterState {
  show:         boolean;
  createdDate:  string;
  createdRange: string;
  updatedDate:  string;
  updatedRange: string;
}

export function getFieldValue(t: TTThink, field: string): string {
  switch (field) {
    case 'Name':        return t.Name.toLowerCase();
    case 'ID':          return t.ID;
    case 'UpdatedAt':   return t.UpdatedAt || t.ID;
    case 'ContentType': return t.ContentType;
    case 'Keywords':    return t.Keywords.toLowerCase();
    case 'RelatedIDs':  return t.RelatedIDs;
    default:            return '';
  }
}

export function applySort(items: TTThink[], sort: SortConfig): TTThink[] {
  if (!sort.field || !sort.dir) return items;
  const { field, dir } = sort;
  return [...items].sort((a, b) => {
    const av = getFieldValue(a, field);
    const bv = getFieldValue(b, field);
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

export function applyDateFilter(items: TTThink[], df: DateFilterState): TTThink[] {
  if (!df.show) return items;
  const cR = computeDateRange(df.createdDate, df.createdRange);
  const uR = computeDateRange(df.updatedDate, df.updatedRange);
  if (!cR && !uR) return items;
  return items.filter(t => {
    if (cR) { const d = t.ID.slice(0, 10); if (d < cR.from || d > cR.to) return false; }
    if (uR) { const d = (t.UpdatedAt || t.ID).slice(0, 10); if (d < uR.from || d > uR.to) return false; }
    return true;
  });
}
