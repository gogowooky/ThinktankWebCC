import { describe, expect, it } from 'vitest';
import {
  appendToHarnessRunEntry, demoteHeadings, formatLocalDate, formatLocalDateTime, hasHarnessRunEntry, latestAiViewEntries,
  prependAiViewEntry,
} from './aiViewFormat';
import { diffLines } from './lineDiff';

describe('AIViewファイルの日報形式', () => {
  it('ローカル日付を yyyy-MM-dd にする', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('新しい記録をタイトル行の直後に置き、タイトルを揃える', () => {
    const first = prependAiViewEntry('旧タイトル', '計画', { date: '2026-10-30', label: '現状要約', body: 'A' });
    expect(first).toBe('計画\n# [2026-10-30] 現状要約\nA\n');
    const second = prependAiViewEntry(first, '計画', { date: '2026-10-31', label: '進捗要約', body: '\nB\n' });
    expect(second).toBe('計画\n# [2026-10-31] 進捗要約\nB\n\n# [2026-10-30] 現状要約\nA\n');
  });

  it('モデル名があればタイトル行の次の行に「(モデル名)」を書き、要約はその次の行から', () => {
    expect(prependAiViewEntry('計画', '計画', { date: '2026-10-31', label: '進捗要約', model: 'gpt-5.6-sol', body: '進んだ' }))
      .toBe('計画\n# [2026-10-31] 進捗要約\n(gpt-5.6-sol)\n進んだ\n');
  });

  it('要約の # 見出しだけを1段下げ、コードブロックの中は変えない', () => {
    expect(demoteHeadings('# 見出し\n## 小見出し\n```\n# コード\n```\n本文 # 文中'))
      .toBe('## 見出し\n## 小見出し\n```\n# コード\n```\n本文 # 文中');
  });
});

describe('AIハーネスの log の記録', () => {
  const log = [
    'P｜log',
    '# [2026-11-22 10:30] 実行 bbbb2222', '(claude)', '新しい記録', '```', '# [x] 実行 zzzz', '```', '',
    '# [2026-11-21 09:00] 実行 aaaa1111', '古い記録',
  ].join('\n');

  it('実行IDで記録を見分け、直近の記録だけを取り出す', () => {
    expect(formatLocalDateTime(new Date(2026, 10, 22, 9, 5))).toBe('2026-11-22 09:05');
    expect(hasHarnessRunEntry(log, 'bbbb2222')).toBe(true);
    expect(hasHarnessRunEntry(log, 'aaaa111')).toBe(false);
    expect(latestAiViewEntries(log, 1)).toBe('# [2026-11-22 10:30] 実行 bbbb2222\n(claude)\n新しい記録\n```\n# [x] 実行 zzzz\n```');
    expect(latestAiViewEntries(log, 5)).toContain('古い記録');
  });

  it('記録の末尾にアプリが確かめた事実を加える（次の記録やコードブロックの中には入れない）', () => {
    const updated = appendToHarnessRunEntry(log, 'bbbb2222', ['- 関連chat: [chat:2026-11-22-000001]']);
    expect(updated).toContain('```\n- 関連chat: [chat:2026-11-22-000001]\n\n# [2026-11-21 09:00]');
    expect(appendToHarnessRunEntry(log, 'cccc3333', ['x'])).toBe(log);
  });
});

describe('行単位の差分', () => {
  it('同じ本文は変更なし', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual({ changed: false, lines: [] });
  });

  it('追加行と削除行を元の順に並べる', () => {
    expect(diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne').lines).toEqual(['- b', '+ B', '+ e']);
    expect(diffLines('a\r\nb', 'a\nb\nc').lines).toEqual(['+ c']);
  });
});
