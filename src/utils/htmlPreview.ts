import DOMPurify from 'dompurify';

/** HTML Think uses the same title-line/body storage contract as other Thinks. */
export function buildHtmlPreview(content: string, fontSize = 18): string {
  const body = content.slice(content.indexOf('\n') < 0 ? content.length : content.indexOf('\n') + 1);
  const clean = DOMPurify.sanitize(body, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'base', 'link', 'audio', 'video'],
    FORBID_ATTR: ['href', 'srcset', 'action', 'formaction', 'target', 'download'],
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";
  doc.head.prepend(policy);
  const style = doc.createElement('style');
  style.textContent = `html { font-size: ${Math.min(28, Math.max(14, fontSize))}px; } body { margin: 20px; color: #172b4d; background: #fff; font-family: system-ui, sans-serif; line-height: 1.7; overflow-wrap: anywhere; } img, svg { max-width: 100%; } table { border-collapse: collapse; } th, td { padding: .6em; border: 1px solid #bac6d3; }`;
  doc.head.append(style);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}

export const NEW_HTML_CONTENT = `新しいHTML資料
<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>比較メモ</title></head>
<body>
<h1>比較して考える</h1>
<p>比較する内容と、判断に使う条件を書いてください。</p>
<table><thead><tr><th>条件</th><th>候補A</th><th>候補B</th></tr></thead>
<tbody><tr><th>費用</th><td>未確認</td><td>未確認</td></tr>
<tr><th>使いやすさ</th><td>未確認</td><td>未確認</td></tr></tbody></table>
<h2>次に確認すること</h2><p>ここに記入します。</p>
</body></html>`;
