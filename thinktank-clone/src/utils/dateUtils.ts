// 日付範囲（-1w などの相対指定含む）のパース・計算（仕様書03 §2.4）

/** `-1w` `-3d` `-2m` `-1y` または `yyyy-mm-dd` を Date に変換する */
export function parseDateToken(token: string, base: Date = new Date()): Date | null {
  const t = token.trim();
  if (!t) return null;
  const rel = t.match(/^-(\d+)([dwmy])$/i);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const d = new Date(base);
    switch (rel[2].toLowerCase()) {
      case 'd': d.setDate(d.getDate() - n); break;
      case 'w': d.setDate(d.getDate() - n * 7); break;
      case 'm': d.setMonth(d.getMonth() - n); break;
      case 'y': d.setFullYear(d.getFullYear() - n); break;
    }
    return d;
  }
  const abs = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (abs) {
    return new Date(parseInt(abs[1], 10), parseInt(abs[2], 10) - 1, parseInt(abs[3], 10));
  }
  return null;
}

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

/** `2026-06-01, -1w` のようなカンマ区切り指定を範囲に変換する */
export function parseDateRange(spec: string): DateRange {
  const parts = spec.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { from: null, to: null };
  const dates = parts.map((p) => parseDateToken(p)).filter((d): d is Date => d !== null);
  if (dates.length === 0) return { from: null, to: null };
  if (dates.length === 1) return { from: dates[0], to: null };
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

export function inDateRange(dateStr: string, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (range.from && d < range.from) return false;
  if (range.to) {
    const end = new Date(range.to);
    end.setDate(end.getDate() + 1);
    if (d >= end) return false;
  }
  return true;
}

/** ID生成用: yyyy-MM-dd-HHmmss */
export function formatIdTimestamp(d: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** UpdateDate 用: yyyy-MM-dd-HHmmss-mmm-rand（仕様書03 §1.2） */
export function formatUpdateTimestamp(d: Date = new Date()): string {
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${formatIdTimestamp(d)}-${ms}-${rand}`;
}

export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
