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

/** bundleNames は buildBundleNames() の結果。'Bundle' 以外のフィールドでは不要。 */
export function getFieldValue(t: TTThink, field: string, bundleNames?: Map<string, string>): string {
  switch (field) {
    case 'Name':        return t.Name.toLowerCase();
    case 'ID':          return t.ID;
    case 'UpdatedAt':   return t.UpdatedAt || t.ID;
    case 'ContentType': return t.ContentType;
    case 'Keywords':    return t.Keywords.toLowerCase();
    case 'RelatedIDs':  return t.RelatedIDs;
    // 表示と並び順を一致させるため、IDではなく画面に出るBundle名で比較する
    case 'Bundle':      return (bundleNames?.get(t.ID) ?? '').toLowerCase();
    default:            return '';
  }
}

export function applySort(items: TTThink[], sort: SortConfig, bundleNames?: Map<string, string>): TTThink[] {
  if (!sort.field || !sort.dir) return items;
  const { field, dir } = sort;
  return [...items].sort((a, b) => {
    const av = getFieldValue(a, field, bundleNames);
    const bv = getFieldValue(b, field, bundleNames);
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
