/**
 * シンプルなMarkdown→HTML変換ユーティリティ
 * WebViewモードでEditorのmdファイルをHTML化して表示するために使用
 */

/**
 * MarkdownテキストをHTMLに変換
 */
export function markdownToHtml(markdown: string): string {
    let html = markdown;

    // コードブロック（```）を先に処理（内部の変換を防ぐ）
    const codeBlocks: string[] = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
        const index = codeBlocks.length;
        codeBlocks.push(`<pre><code class="language-${lang || 'text'}">${escapeHtml(code)}</code></pre>`);
        return `__CODE_BLOCK_${index}__`;
    });

    // インラインコード（`）
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 見出し（# ～ ######）
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // 水平線
    html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

    // 太字（**text** または __text__）
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 斜体（*text* または _text_）
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // リンク [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 画像 ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%;">');

    // 順序なしリスト（- または * または +）
    html = html.replace(/^[-*+]\s+(.+)$/gm, '<li>$1</li>');

    // 順序ありリスト（1. など）
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // 引用（>）
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // 連続する<li>を<ul>でラップ
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
        return '<ul>' + match + '</ul>';
    });

    // 連続する<blockquote>をまとめる
    html = html.replace(/(<blockquote>.*<\/blockquote>\n?)+/g, (match) => {
        const content = match.replace(/<\/?blockquote>/g, '').trim();
        return '<blockquote>' + content + '</blockquote>';
    });

    // 段落（空行で区切られたテキスト）
    html = html.replace(/\n\n+/g, '</p><p>');

    // 改行
    html = html.replace(/\n/g, '<br>');

    // コードブロックを復元
    codeBlocks.forEach((block, index) => {
        html = html.replace(`__CODE_BLOCK_${index}__`, block);
    });

    // 最終的なラッピング
    html = '<p>' + html + '</p>';

    // 空の<p>タグを削除
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p><br><\/p>/g, '');

    return html;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * MarkdownをプレビュースタイルHTML付きで完全なHTMLドキュメントとして返す
 */
export function markdownToHtmlDocument(markdown: string, title: string = 'Preview', fontSize: number = 16): string {
    const content = markdownToHtml(markdown);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            font-family: Meiryo, 'Segoe UI', sans-serif;
            font-size: ${fontSize}px;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            color: #483D8B;
            background-color: #FFFAF5;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            font-weight: bold;
        }
        h1 { color: #008000; border-bottom: 2px solid #008000; padding-bottom: 0.3em; }
        h2 { color: #CC8500; border-bottom: 1px solid #CC8500; padding-bottom: 0.2em; }
        h3 { color: #DB7093; }
        h4 { color: #4682B4; }
        h5 { color: #A52A2A; }
        h6 { color: #008080; }
        code {
            background-color: #F0E6FA;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: Consolas, monospace;
        }
        pre {
            background-color: #F0E6FA;
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
        }
        pre code {
            background: none;
            padding: 0;
        }
        blockquote {
            border-left: 4px solid #6A5ACD;
            margin: 0;
            padding: 0.5em 1em;
            color: #666;
            background-color: #F5F0FF;
        }
        a {
            color: #4169E1;
        }
        ul, ol {
            padding-left: 2em;
        }
        hr {
            border: none;
            border-top: 1px solid #B0B0D8;
            margin: 2em 0;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        /* スクロールバースタイル - Monaco Editorと同じ */
        ::-webkit-scrollbar {
            width: 14px;
            height: 14px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: transparent;
            border-radius: 0;
            transition: background 0.2s;
        }
        body:hover ::-webkit-scrollbar-thumb,
        html:hover ::-webkit-scrollbar-thumb {
            background: rgba(121, 121, 121, 0.4);
        }
        ::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 100, 100, 0.7);
        }
        ::-webkit-scrollbar-corner {
            background: transparent;
        }
    </style>
</head>
<body>
${content}
</body>
</html>`;
}
