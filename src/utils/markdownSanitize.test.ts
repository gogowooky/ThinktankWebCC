// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { escapeHtml, renderMarkdown, renderMarkdownSections } from './markdownSanitize';

/** renderMarkdown は string | Promise<string> を返すため両方を吸収する */
async function render(md: string): Promise<string> {
  return Promise.resolve(renderMarkdown(md));
}

describe('escapeHtml', () => {
  it('HTML 特殊文字を実体参照にする', () => {
    expect(escapeHtml(`<a href="x" onmouseover='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; onmouseover=&#39;y&#39;&gt;&amp;',
    );
  });
});

describe('renderMarkdown — XSS ベクタの無害化', () => {
  it('<script> を除去する', async () => {
    const html = await render('前\n\n<script>alert(1)</script>\n\n後');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('インライン HTML のイベントハンドラ属性を除去する', async () => {
    const html = await render('<img src=x onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('<iframe> を除去する', async () => {
    const html = await render('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('javascript: リンクは遷移させずテキストだけ残す', async () => {
    const html = await render('[クリック](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toMatch(/<a\s/);
    expect(html).toContain('クリック');
  });

  it('data: リンクも遷移させない', async () => {
    const html = await render('[x](data:text/html,<script>alert(1)</script>)');
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('<script');
  });
});

describe('renderMarkdown — 正当なリンク', () => {
  it('http(s) リンクは target=_blank rel=noopener 付きで残る', async () => {
    const html = await render('[Anthropic](https://www.anthropic.com)');
    expect(html).toContain('href="https://www.anthropic.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('見出し・強調は描画される', async () => {
    const h1 = await render('# 見出し');
    expect(h1).toMatch(/<h1[^>]*>/);
    const strong = await render('**太字**');
    expect(strong).toMatch(/<strong[^>]*>太字<\/strong>/);
  });
});

describe('renderMarkdownSections', () => {
  it('見出しごとに <details> で包み、本文の <script> は除去する', async () => {
    const html = await renderMarkdownSections(
      '# A\n\n<script>alert(1)</script>\n\n## B\n\n本文',
      new Set<number>(),
      0,
    );
    expect(html).toContain('<details');
    expect(html).not.toContain('<script');
  });

  it('closedSourceLines に含まれる見出しは open 属性なしで出力する', async () => {
    const open = await renderMarkdownSections('# A\n\n本文', new Set<number>(), 0);
    const closed = await renderMarkdownSections('# A\n\n本文', new Set<number>([1]), 0);
    expect(open).toContain(' open>');
    expect(closed).not.toContain(' open>');
  });
});
