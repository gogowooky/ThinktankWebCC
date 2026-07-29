/**
 * japaneseDate.ts
 * TextEditor.EditDate 系アクション（TTFocusedPanelActions.ts）が使う和暦変換・日付文字列の
 * パース/フォーマット・カーソル位置の日付検出ロジック。
 *
 * 元は views/TTFocusedPanelActions.ts に同居していたが、日付処理は他のFocusedPanel
 * アクション（パネル操作・エディタ操作全般）と無関係な独立ドメインのため分離した。
 */
import type { editor as MonacoEditor } from 'monaco-editor';

/** 元号の切替日（YYYYMMDD形式の数値）。境界日はその元号の初日。 */
const ERA_BOUNDARIES = [
  { boundary: 20190501, era: '令和', startYear: 2019 },
  { boundary: 19890108, era: '平成', startYear: 1989 },
  { boundary: 19261225, era: '昭和', startYear: 1926 },
  { boundary: 19120730, era: '大正', startYear: 1912 },
  { boundary: -Infinity, era: '明治', startYear: 1868 },
] as const;

export function getJapaneseEra(date: Date): { era: string; year: number } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dateVal = y * 10000 + m * 100 + d;

  const matched = ERA_BOUNDARIES.find(e => dateVal >= e.boundary)!;
  return { era: matched.era, year: y - matched.startYear + 1 };
}

export function formatDate(date: Date, formatKey: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ddd = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];

  if (formatKey.startsWith('GDate')) {
    const eraInfo = getJapaneseEra(date);
    const ggyy = eraInfo.era + pad(eraInfo.year);
    switch (formatKey) {
      case 'GDate': return `${ggyy}年${MM}月${dd}日`;
      case 'GDateW': return `${ggyy}年${MM}月${dd}日 (${ddd})`;
      case 'GDateT': return `${ggyy}年${MM}月${dd}日 ${HH}時${mm}分`;
      case 'GDateWT': return `${ggyy}年${MM}月${dd}日 (${ddd}) ${HH}時${mm}分`;
      default: return `${ggyy}年${MM}月${dd}日`;
    }
  }

  switch (formatKey) {
    case 'DateTag': return `[${yyyy}-${MM}-${dd}]`;
    case 'Date': return `${yyyy}/${MM}/${dd}`;
    case 'DateW': return `${yyyy}/${MM}/${dd} (${ddd})`;
    case 'DateT': return `${yyyy}/${MM}/${dd} ${HH}:${mm}`;
    case 'DateWT': return `${yyyy}/${MM}/${dd} (${ddd}) ${HH}:${mm}`;
    case 'JDate': return `${yyyy}年${MM}月${dd}日`;
    case 'JDateW': return `${yyyy}年${MM}月${dd}日 (${ddd})`;
    case 'JDateT': return `${yyyy}年${MM}月${dd}日 ${HH}:${mm}`;
    case 'JDateWT': return `${yyyy}年${MM}月${dd}日 (${ddd}) ${HH}:${mm}`;
    default: return `${yyyy}/${MM}/${dd}`;
  }
}

export function parseDateString(str: string, key: string): Date | null {
  try {
    if (key === 'DateTag') {
      const clean = str.replace(/[\[\]]/g, '');
      const parts = clean.split('-');
      if (parts.length === 3) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    } else if (key === 'Date') {
      const clean = str.replace(/\s\([日月火水木金土]\)/, '');
      const parts = clean.split(/\s+/);
      const dateParts = parts[0].split('/');
      let hour = 0, minute = 0;
      if (parts[1] && parts[1].includes(':')) {
        const timeParts = parts[1].split(':');
        hour = Number(timeParts[0]);
        minute = Number(timeParts[1]);
      }
      return new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]), hour, minute);
    } else if (key === 'JDate') {
      const clean = str.replace(/\s\([日月火水木金土]\)/, '');
      const parts = clean.split(/\s+/);
      const dateMatch = parts[0].match(/(\d+)年(\d+)月(\d+)日/);
      if (!dateMatch) return null;
      let hour = 0, minute = 0;
      if (parts[1] && parts[1].includes(':')) {
        const timeParts = parts[1].split(':');
        hour = Number(timeParts[0]);
        minute = Number(timeParts[1]);
      }
      return new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hour, minute);
    } else if (key === 'GDate') {
      const clean = str.replace(/\s\([日月火水木金土]\)/, '');
      const parts = clean.split(/\s+/);
      const dateMatch = parts[0].match(/^(明治|大正|昭和|平成|令和)(元|\d+)年(\d+)月(\d+)日/);
      if (!dateMatch) return null;

      const era = dateMatch[1];
      const eraYearStr = dateMatch[2];
      const month = Number(dateMatch[3]);
      const day = Number(dateMatch[4]);

      const eraYear = eraYearStr === '元' ? 1 : Number(eraYearStr);
      let year = 0;
      if (era === '令和') year = 2019 + eraYear - 1;
      else if (era === '平成') year = 1989 + eraYear - 1;
      else if (era === '昭和') year = 1926 + eraYear - 1;
      else if (era === '大正') year = 1912 + eraYear - 1;
      else if (era === '明治') year = 1868 + eraYear - 1;

      let hour = 0, minute = 0;
      if (parts[1]) {
        const timeMatch = parts[1].match(/(\d+)時(\d+)分/);
        if (timeMatch) {
          hour = Number(timeMatch[1]);
          minute = Number(timeMatch[2]);
        }
      }
      return new Date(year, month - 1, day, hour, minute);
    }
  } catch (e) {
    console.error('Error parsing date string:', str, e);
  }
  return null;
}

export interface DateMatch {
  key: 'DateTag' | 'Date' | 'JDate' | 'GDate';
  value: string;
  startColumn: number;
  endColumn: number;
  lineNumber: number;
  date: Date;
  hasWeek: boolean;
  hasTime: boolean;
}

export function findDateAtCaret(editor: MonacoEditor.IStandaloneCodeEditor): DateMatch | null {
  const model = editor.getModel();
  if (!model) return null;
  const position = editor.getPosition();
  if (!position) return null;

  const lineNumber = position.lineNumber;
  const lineContent = model.getLineContent(lineNumber);
  const caretColumn = position.column;

  const regexes = [
    { key: 'DateTag' as const, regex: /\[\d{4}-\d{2}-\d{2}\]/g },
    { key: 'Date' as const, regex: /\d{4}\/\d{1,2}\/\d{1,2}(?:\s\([日月火水木金土]\))?(?:\s\d{2}:\d{2})?/g },
    { key: 'JDate' as const, regex: /\d{4}年\d{1,2}月\d{1,2}日(?:\s\([日月火水木金土]\))?(?:\s\d{2}:\d{2})?/g },
    { key: 'GDate' as const, regex: /(?:明治|大正|昭和|平成|令和)(?:\d{1,2}|元)年\d{1,2}月\d{1,2}日(?:\s\([日月火水木金土]\))?(?:\s\d{2}時\d{2}分)?/g }
  ];

  for (const item of regexes) {
    let match;
    item.regex.lastIndex = 0;
    while ((match = item.regex.exec(lineContent)) !== null) {
      const matchText = match[0];
      const startIdx = match.index;
      const endIdx = startIdx + matchText.length;
      const startColumn = startIdx + 1;
      const endColumn = endIdx + 1;

      if (caretColumn >= startColumn && caretColumn <= endColumn) {
        const parsedDate = parseDateString(matchText, item.key);
        if (parsedDate) {
          const hasWeek = matchText.includes('(');
          const hasTime = matchText.includes(':') || matchText.includes('時');
          return {
            key: item.key,
            value: matchText,
            startColumn,
            endColumn,
            lineNumber,
            date: parsedDate,
            hasWeek,
            hasTime
          };
        }
      }
    }
  }

  return null;
}
