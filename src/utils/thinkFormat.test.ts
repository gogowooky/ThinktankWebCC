import { describe, it, expect } from 'vitest';
import {
  parseChat,
  serializeChat,
  parseLinks,
  serializeLinks,
  splitContent,
  parseBundle,
  serializeBundle,
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

describe('bundle 形式の往復', () => {
  it('ID リストの serialize → parse', () => {
    const ids = ['2026-01-02-030405', '2026-01-02-030406'];
    const parsed = parseBundle(serializeBundle({ prefix: '', title: '束', ids }));
    expect(parsed.title).toBe('束');
    expect(parsed.ids).toEqual(ids);
  });

  it('除外 ID（- 行）を excludeIds に取り込む', () => {
    const parsed = parseBundle('束\n* 2026-01-02-030405\n- 2026-01-02-030406');
    expect(parsed.ids).toEqual(['2026-01-02-030405']);
    expect(parsed.excludeIds).toEqual(['2026-01-02-030406']);
  });

  it('フィルタ Keyword 行を filter.keyword に取り込む', () => {
    const parsed = parseBundle('束\n> Keyword：設計');
    expect(parsed.filter.keyword).toBe('設計');
  });

  // ── D-5（既知の不整合）を固定するテスト ────────────────────────────────
  // parseBundle の ID 判定は /^\d{4}-\d{2}-\d{2}-\d{6}$/ で、サフィックス付き ID
  // （AI が .thinktank/thinktank.md の指示どおり生成する `-memo` 等）にマッチしない。
  // その結果、ID 行がキーワードフィルタとして解釈される。
  // これは PROJECT_REVIEW_REPORT.md D-5 の症状。修正時にこのテストを更新すること。
  it('【現状の挙動】サフィックス付き ID は ID として認識されずキーワード扱いになる', () => {
    const parsed = parseBundle('束\n* 2026-07-01-232001-memo');
    expect(parsed.ids).toEqual([]);
    expect(parsed.filter.keyword).toBe('2026-07-01-232001-memo');
  });
});
