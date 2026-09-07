// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildHtmlPreview } from './htmlPreview';

describe('HTML preview isolation', () => {
  it('preserves tables and inline CSS without rendering the Think title', () => {
    const doc = new DOMParser().parseFromString(buildHtmlPreview('資料タイトル\n<style>td{color:red}</style><table><tr><td>比較</td></tr></table>'), 'text/html');
    expect(doc.querySelector('td')?.textContent).toBe('比較');
    expect(doc.body.textContent).not.toContain('資料タイトル');
    expect(doc.querySelector('style')?.textContent).toContain('color:red');
  });
  it('removes active content, navigation and policy overrides; blocks external resources', () => {
    const html = buildHtmlPreview('資料\n<meta http-equiv="refresh" content="0;url=https://example.com"><script>alert(1)</script><iframe src="https://example.com"></iframe><form action="/api"><input></form><a href="https://example.com">リンク</a><img src="https://example.com/a" onerror="alert(1)">');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('script,iframe,form,input,[href],[onerror]')).toBeNull();
    expect(doc.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(doc.head.firstElementChild?.getAttribute('content')).toContain("default-src 'none'");
    expect(doc.head.firstElementChild?.getAttribute('content')).toContain('img-src data:');
  });
  it('handles empty or title-only files', () => {
    expect(new DOMParser().parseFromString(buildHtmlPreview('タイトルだけ'), 'text/html').body.textContent).toBe('');
  });
});
