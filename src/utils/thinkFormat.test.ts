import { describe, it, expect } from 'vitest';
import {
  parseChat,
  serializeChat,
  parseLinks,
  serializeLinks,
  splitContent,
  parseProject,
  serializeProject,
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

describe('links 形式の往復', () => {
  it('serialize → parse でリンクが保存される', () => {
    const links = [
      { title: 'Anthropic', url: 'https://www.anthropic.com' },
      { title: 'GitHub', url: 'https://github.com' },
    ];
    const restored = parseLinks(serializeLinks('リンク集', links));
    expect(restored).toEqual(links);
  });

  it('マークダウンリンク形式でない行は title=url として扱う', () => {
    expect(parseLinks('タイトル\n* https://example.com')).toEqual([
      { title: 'https://example.com', url: 'https://example.com' },
    ]);
  });
});

describe('project 形式の往復', () => {
  it('ID リストの serialize → parse（新フォーマット）', () => {
    const ids = ['2026-01-02-030405', '2026-01-02-030406'];
    const serialized = serializeProject({ title: '束', ids });
    expect(serialized).toBe([
      '束',
      '=',
      '# 状態',
      '状態値：未着手',
      '最終評価日：',
      '# 対象',
      '[memo:2026-01-02-030405]',
      '[memo:2026-01-02-030406]',
      '# プロンプト',
      '# 条件',
      '# 出力先',
      '# 評価内容',
      '# 評価日時',
    ].join('\n'));
    const parsed = parseProject(serialized);
    expect(parsed.title).toBe('束');
    expect(parsed.ids).toEqual(ids);
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
