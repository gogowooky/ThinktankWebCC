import { describe, it, expect } from 'vitest';
import {
  parseChat,
  serializeChat,
  splitContent,
  parseProject,
  serializeProject,
  updateProjectTargets,
} from './thinkFormat';

describe('splitContent', () => {
  it('先頭行を title、残りを body に分割する', () => {
    expect(splitContent('タイトル\n本文1\n本文2')).toEqual({
      title: 'タイトル',
      body: '本文1\n本文2',
    });
  });

  it('改行が無い場合は body を空にする', () => {
    expect(splitContent('タイトルのみ')).toEqual({ title: 'タイトルのみ', body: '' });
  });

  it('空文字は title/body ともに空', () => {
    expect(splitContent('')).toEqual({ title: '', body: '' });
  });
});

describe('chat 形式の往復', () => {
  it('serialize → parse で role/content が保存される', () => {
    const messages = [
      { id: 'x', role: 'user' as const, content: 'こんにちは', timestamp: '' },
      { id: 'y', role: 'assistant' as const, content: '応答1行目\n応答2行目', timestamp: '' },
      { id: 'z', role: 'user' as const, content: '追加の質問', timestamp: '' },
    ];
    const restored = parseChat(serializeChat(messages));
    expect(restored.map((m) => ({ role: m.role, content: m.content }))).toEqual(
      messages.map((m) => ({ role: m.role, content: m.content })),
    );
  });

  it('タイトル付き serialize は先頭行にタイトルを置く', () => {
    const out = serializeChat([{ id: 'a', role: 'user', content: 'q', timestamp: '' }], 'MyChat');
    expect(out.split('\n')[0]).toBe('MyChat');
  });
});

describe('project 形式の往復', () => {
  it('ID リストの serialize → parse（新フォーマット）', () => {
    const ids = ['2026-01-02-030405', '2026-01-02-030406'];
    const serialized = serializeProject({ title: '束', ids });
    expect(serialized).toBe([
      '束',
      '=',
      '# 見通し',
      '# 状態',
      '状態値：未着手',
      '# 対象',
      '[memo:2026-01-02-030405]',
      '[memo:2026-01-02-030406]',
      '# プロンプト',
      '# 条件',
      '# AIまとめ',
      '# AI議論',
    ].join('\n'));
    const parsed = parseProject(serialized);
    expect(parsed.title).toBe('束');
    expect(parsed.ids).toEqual(ids);
  });

  it('見通し・AIまとめ・AI議論を書き、AIの参照を読み分ける', () => {
    const serialized = serializeProject({
      title: 'P', outlook: '来月までに方針を固める',
      items: [{ id: '2026-01-02-030405', contentType: 'links', title: '資料' }],
      aiSummaryIds: ['2026-01-02-030407'], aiDiscussionIds: ['2026-01-02-030408'],
    });
    expect(serialized).toBe([
      'P', '=',
      '# 見通し', '来月までに方針を固める',
      '# 状態', '状態値：未着手',
      '# 対象', '[link:2026-01-02-030405]: 資料',
      '# プロンプト', '# 条件',
      '# AIまとめ', '[aiview:2026-01-02-030407]',
      '# AI議論', '[chat:2026-01-02-030408]',
    ].join('\n'));
    expect(parseProject(serialized)).toEqual({
      title: 'P',
      ids: ['2026-01-02-030405', '2026-01-02-030407', '2026-01-02-030408'],
      aiSummaryIds: ['2026-01-02-030407'],
      aiDiscussionIds: ['2026-01-02-030408'],
    });
  });

  it('# 対象 の更新では url/path/検索タグ・Linkタグ名を残し、AIの参照を重複させない', () => {
    const content = [
      'P', '=', '# 状態', '状態値：進行中',
      '# 対象',
      '[gdrive:2026-01-02-030405]: 資料',
      '[links:2026-01-02-030406]: 旧リンク',
      'https://example.com/',
      '"C:\\docs\\plan.md"',
      '[Google:検索語]',
      '# AI議論', '[chat:2026-01-02-030408]',
    ].join('\n');
    const updated = updateProjectTargets(content, [
      { id: '2026-01-02-030405', contentType: 'links', title: '資料' },
      { id: '2026-01-02-030406', contentType: 'links', title: '旧リンク' },
      { id: '2026-01-02-030408', contentType: 'chat', title: '議論' },
      { id: '2026-01-02-030409', contentType: 'memo', title: '追加' },
    ]);
    expect(updated).toBe([
      'P', '=', '# 状態', '状態値：進行中',
      '# 対象',
      '[gdrive:2026-01-02-030405]: 資料',
      '[link:2026-01-02-030406]: 旧リンク',
      '[memo:2026-01-02-030409]: 追加',
      'https://example.com/',
      '"C:\\docs\\plan.md"',
      '[Google:検索語]',
      '# AI議論', '[chat:2026-01-02-030408]',
    ].join('\n'));
  });

  it('タイトル付きThinkタグ形式（[memo:ID]: タイトル）も parse できる', () => {
    const content = [
      'プロジェクトA',
      '=',
      '# 対象',
      '[memo:2026-01-02-030405]: 設計メモ',
      'https://example.com',
      '[gmail:18f3abc]: メール件名',
      '[chat:2026-01-02-030406]: 相談履歴',
    ].join('\n');
    const parsed = parseProject(content);
    expect(parsed.title).toBe('プロジェクトA');
    expect(parsed.ids).toEqual(['2026-01-02-030405', '2026-01-02-030406']);
  });

  it('廃止したフィルター式・検索式・除外行をメンバー指定として扱わない', () => {
    const parsed = parseProject('束\n> Keyword：設計\n> 作成日：2026-01-01,@7d\n>> 検索語：本文\n- 2026-01-02-030406\n* 2026-01-02-030405');
    expect(parsed.ids).toEqual(['2026-01-02-030405']);
  });

  // ── D-5（対応済み 2026-08-31）────────────────────────────────────────
  it('サフィックス付き ID（AI 生成の -memo / 衝突回避の -a3f9 等）を ID として認識する', () => {
    const parsed = parseProject('束\n* 2026-07-01-232001-memo\n* 2026-07-01-232002-a3f9');
    expect(parsed.ids).toEqual(['2026-07-01-232001-memo', '2026-07-01-232002-a3f9']);
  });

  it('角括弧付きの ID 行も許容する', () => {
    const parsed = parseProject('束\n* [2026-07-01-232001-memo]');
    expect(parsed.ids).toEqual(['2026-07-01-232001-memo']);
  });

  it('ID形式でない `* 行` は無視し、フィルタ語にも流用しない', () => {
    const parsed = parseProject('束\n* 設計メモ\n* thinktank\n* __tt_ui_state__\n* 2026-07-01-232001\n* 2015-03-09-133514-LAPTOP-5FOVA1SU');
    expect(parsed.ids).toEqual(['2026-07-01-232001', '2015-03-09-133514-LAPTOP-5FOVA1SU']);
  });
});
