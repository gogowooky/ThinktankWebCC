import { describe, expect, it } from 'vitest';
import {
  captionOfLinkFile,
  createLinkFile,
  formatLinkTag,
  formatLinkTagWithCaption,
  linkTargetKey,
  linkTagOfFile,
  linkAffiliationOf,
  linkTagNameOf,
  parentFolderOf,
  parseLegacyLinks,
  parseLinkFile,
  parseLinkTag,
  pathRootOf,
  serializeLinkFile,
} from './linkFormat';

describe('linkTagNameOf', () => {
  it.each([
    ['https://mail.google.com/mail/u/0/#inbox/18f3abc012345678', 'gmail'],
    ['https://drive.google.com/file/d/1AbC/view', 'gdrive'],
    ['https://docs.google.com/document/d/1AbC/edit', 'gdrive'],
    ['https://photos.google.com/share/AF1Q', 'gphoto'],
    ['https://photos.app.goo.gl/abcd', 'gphoto'],
    ['https://notebook.google.com/notebook/xyz', 'gnb'],
    ['https://notebooklm.google.com/notebook/xyz', 'gnb'],
    ['https://example.com/page', 'link'],
    ['mailto:someone@example.com', 'link'],
  ] as const)('%s → %s', (target, tag) => {
    expect(linkTagNameOf(target)).toBe(tag);
  });

  it('ホスト名は完全一致で判定し、似せたホストやhttpはlinkにする', () => {
    expect(linkTagNameOf('https://photos.google.com.example.test/x')).toBe('link');
    expect(linkTagNameOf('https://evil.example/drive.google.com')).toBe('link');
    expect(linkTagNameOf('http://drive.google.com/x')).toBe('link');
  });

  it.each([
    'C:\\Users\\a\\b.md',
    'c:/Users/a/b.md',
    '\\\\server\\share\\x.xlsx',
    '/home/a/b.txt',
    'file:///C:/a/b.txt',
    'report.pdf',
  ])('%s はパス', target => {
    expect(linkTagNameOf(target)).toBe('path');
  });
});

describe('Affiliation', () => {
  it('URLはサーバーアドレス（ポートを含む）', () => {
    expect(linkAffiliationOf('https://example.com/a?b=1', 'PC1')).toBe('example.com');
    expect(linkAffiliationOf('http://localhost:5173/x', 'PC1')).toBe('localhost:5173');
  });

  it('パスは親フォルダを取得する', () => {
    expect(pathRootOf('c:\\Users\\a\\b.md')).toBe('C:');
    expect(pathRootOf('\\\\srv\\share\\dir\\x')).toBe('\\\\srv\\share');
    expect(pathRootOf('/home/a/b')).toBe('/home');
    expect(parentFolderOf('C:\\Users\\a\\b.md')).toBe('C:\\Users\\a');
    expect(parentFolderOf('D:\\x')).toBe('D:\\');
    expect(parentFolderOf('\\\\srv\\share\\dir\\x')).toBe('\\\\srv\\share\\dir');
    expect(parentFolderOf('/home/a/b')).toBe('/home/a');
    expect(linkAffiliationOf('C:\\Users\\a\\b.md', 'MYPC')).toBe('(MYPC)C:\\Users\\a');
    expect(linkAffiliationOf('\\\\srv\\share\\x', 'MYPC')).toBe('(MYPC)\\\\srv\\share');
  });

  it('PC名や親フォルダが分からない場合も判明分を記録する', () => {
    expect(linkAffiliationOf('D:\\x', '')).toBe('(unknown)D:\\');
    expect(linkAffiliationOf('report.pdf', 'MYPC')).toBe('(MYPC)');
  });
});

describe('linkファイルの書式', () => {
  it('1行目タイトル・2行目=・3行目から見出しの順で書く', () => {
    const text = serializeLinkFile(createLinkFile({ target: 'https://example.com/', title: 'example.com', pageTitle: 'Example Domain' }, 'PC1'));
    expect(text).toBe([
      'Example Domain',
      '==============================',
      '# Caption',
      'Example Domain',
      '# Link',
      'https://example.com/',
      '# Affiliation',
      'example.com',
      '# Abstract',
    ].join('\n'));
  });

  it('作成時に端末idを # 作成端末 に書く（Affiliation の後、Abstract の前）', () => {
    const text = serializeLinkFile(createLinkFile({ target: 'https://example.com/', title: 'example.com' }, 'PC1', 'pc_PC1_a1b2c3'));
    expect(text).toBe([
      'example.com',
      '==============================',
      '# Caption',
      'example.com',
      '# Link',
      'https://example.com/',
      '# Affiliation',
      'example.com',
      '# 作成端末',
      'pc_PC1_a1b2c3',
      '# Abstract',
    ].join('\n'));
    expect(parseLinkFile(text)?.createdDeviceId).toBe('pc_PC1_a1b2c3');
  });

  it('# 作成端末 の無い旧ファイルは空として読み、書き直しても項を増やさない', () => {
    const old = 'T\n=\n# Link\nhttps://a.example/\n# Affiliation\na.example\n# Abstract\nメモ';
    const file = parseLinkFile(old);
    expect(file?.createdDeviceId).toBe('');
    expect(serializeLinkFile(file!)).not.toContain('# 作成端末');
  });

  it('serialize → parse で往復する', () => {
    const file = { title: '資料', caption: 'File:b.md', link: 'C:\\a\\b.md', affiliation: '(PC1)C:\\a', createdDeviceId: 'web_0a1b2c3d', abstract: '概要1\n概要2' };
    const serialized = serializeLinkFile(file);
    expect(serialized).toContain('# Link\n"C:\\a\\b.md"');
    expect(serialized).toContain('# Affiliation\n"(PC1)C:\\a"');
    expect(parseLinkFile(serialized)).toEqual(file);
  });

  it('旧来の引用符なしpathも読み取れる', () => {
    expect(parseLinkFile('T\n=\n# Link\nC:\\a\\b.jpg\n# Affiliation\nPC:C:\n# Abstract')).toMatchObject({
      link: 'C:\\a\\b.jpg', affiliation: 'PC:C:',
    });
  });

  it('2行目が空行やCRLFでも読める', () => {
    expect(parseLinkFile('T\r\n\r\n# Link\r\nhttps://a.example/\r\n# Abstract\r\nメモ')).toEqual({
      title: 'T', caption: '', link: 'https://a.example/', affiliation: '', createdDeviceId: '', abstract: 'メモ',
    });
  });

  it('旧書式は先頭のリンクを読む', () => {
    const legacy = 'リンク集\n* [Anthropic](https://www.anthropic.com)\n* https://github.com';
    expect(parseLegacyLinks(legacy)).toEqual([
      { title: 'Anthropic', url: 'https://www.anthropic.com' },
      { title: 'https://github.com', url: 'https://github.com' },
    ]);
    expect(parseLinkFile(legacy)).toEqual({ title: 'リンク集', caption: '', link: 'https://www.anthropic.com', affiliation: '', createdDeviceId: '', abstract: '' });
  });

  it('リンクが無ければ null', () => {
    expect(parseLinkFile('タイトルだけ')).toBeNull();
    expect(parseLinkFile('T\n=\n# Link\n\n# Abstract\nx')).toBeNull();
  });
});

describe('Caption', () => {
  const caption = (target: string, pageTitle?: string, isDirectory?: boolean) =>
    createLinkFile({ target, title: 'x', ...(pageTitle ? { pageTitle } : {}), ...(isDirectory !== undefined ? { isDirectory } : {}) }, 'PC1').caption;

  it('GDrive はファイル名・フォルダー名（タブ名のサービス名は外す）', () => {
    expect(caption('https://drive.google.com/file/d/1/view', '見積書.pdf - Google ドライブ')).toBe('見積書.pdf');
    expect(caption('https://docs.google.com/document/d/1/edit', '議事録 - Google Docs')).toBe('議事録');
    expect(caption('https://drive.google.com/drive/folders/1', '2026年度')).toBe('2026年度');
  });

  it('GMail はメールタイトル', () => {
    expect(caption('https://mail.google.com/mail/u/0/#inbox/1', '打合せの件 - me@gmail.com - Gmail')).toBe('打合せの件');
  });

  it('GPhoto は撮影日を yyyy-MM-dd で（撮影場所が分かれば括弧で添える）', () => {
    expect(caption('https://photos.google.com/photo/1', '写真 - 横向き - 2026/11/3 14:22:10')).toBe('2026-11-03');
    expect(caption('https://photos.google.com/photo/1', '写真 - 2026年1月5日 9:00')).toBe('2026-01-05');
    expect(caption('https://photos.google.com/photo/1', 'Photo - Mar 5, 2024, 2:22:13 PM - Location: Kyoto')).toBe('2024-03-05(Kyoto)');
  });

  it('path はファイル/フォルダーを区別する', () => {
    expect(caption('C:\\a\\b.md')).toBe('File:b.md');
    expect(caption('C:\\a\\pics', undefined, true)).toBe('Folder:pics');
    expect(caption('/home/me/docs/')).toBe('Folder:docs');
  });

  it('link はリンク先タイトル、不明なら Affiliation', () => {
    expect(caption('https://example.com/a', 'Example Domain')).toBe('Example Domain');
    expect(caption('https://example.com/a')).toBe('example.com');
    expect(caption('https://example.com/a', 'https://example.com/a')).toBe('example.com');
  });

  it('Caption の無い旧ファイルはタイトル等から補う', () => {
    expect(captionOfLinkFile({ title: '資料', caption: '', link: 'https://example.com/', affiliation: 'example.com', createdDeviceId: '', abstract: '' })).toBe('資料');
    expect(captionOfLinkFile({ title: 'b', caption: '', link: 'C:\\a\\b.md', affiliation: '', createdDeviceId: '', abstract: '' })).toBe('File:b.md');
  });
});

describe('リンク先の同一判定キー', () => {
  it('Windowsのパスは区切り・大文字小文字・末尾区切りを問わない', () => {
    expect(linkTargetKey('C:\\Docs\\Plan.md')).toBe(linkTargetKey('c:/docs/plan.md'));
    expect(linkTargetKey('C:\\Docs\\')).toBe(linkTargetKey('c:\\docs'));
    expect(linkTargetKey('C:\\')).toBe('c:\\');
  });

  it('URLはそのまま比べる', () => {
    expect(linkTargetKey(' https://example.com/a ')).toBe('https://example.com/a');
    expect(linkTargetKey('https://example.com/A')).not.toBe(linkTargetKey('https://example.com/a'));
  });
});

describe('参照タグ', () => {
  it('GMail/GDrive/link/path はタグの後ろに Caption を添える', () => {
    expect(formatLinkTagWithCaption('gdrive', '2026-10-30-120000', '見積書.pdf')).toBe('[gdrive:2026-10-30-120000] 見積書.pdf');
    expect(formatLinkTagWithCaption('file', '2026-10-30-120000', 'File:b.md')).toBe('[file:2026-10-30-120000] File:b.md');
    expect(formatLinkTagWithCaption('dir', '2026-10-30-120000', 'Folder:pics')).toBe('[dir:2026-10-30-120000] Folder:pics');
    expect(formatLinkTagWithCaption('gphoto', '2026-10-30-120000', '2026/11/03')).toBe('[gphoto:2026-10-30-120000]');
    expect(formatLinkTagWithCaption('link', '2026-10-30-120000', '')).toBe('[link:2026-10-30-120000]');
  });

  it('タグ名とThinkIDを組み立て・読み取る（大文字小文字は問わない）', () => {
    expect(formatLinkTag('gdrive', '2026-10-30-120000')).toBe('[gdrive:2026-10-30-120000]');
    expect(parseLinkTag('[GDrive:2026-10-30-120000]')).toEqual({ tag: 'gdrive', thinkId: '2026-10-30-120000' });
    expect(parseLinkTag('[path: 2026-10-30-120000-a3f9 ]')).toEqual({ tag: 'path', thinkId: '2026-10-30-120000-a3f9' });
  });

  it('値がThinkIDでない・未知のタグ名は対象外', () => {
    expect(parseLinkTag('[GMail:from:a@example.com]')).toBeNull();
    expect(parseLinkTag('[memo:2026-10-30-120000]')).toBeNull();
    expect(parseLinkTag('link:2026-10-30-120000')).toBeNull();
  });

  it('パスのlinkファイルはファイルなら file、フォルダなら dir のタグにする', () => {
    const file = (link: string, caption: string) => ({ title: 't', caption, link, affiliation: '', createdDeviceId: '', abstract: '' });
    expect(linkTagOfFile(file('C:\\a\\b.md', 'File:b.md'))).toBe('file');
    expect(linkTagOfFile(file('C:\\a\\pics', 'Folder:pics'))).toBe('dir');
    expect(linkTagOfFile(file('/home/me/docs/', ''))).toBe('dir');
    expect(linkTagOfFile(file('https://drive.google.com/file/d/1/view', ''))).toBe('gdrive');
    expect(parseLinkTag('[File:2026-10-30-120000]')).toEqual({ tag: 'file', thinkId: '2026-10-30-120000' });
    expect(parseLinkTag('[dir:2026-10-30-120000]')).toEqual({ tag: 'dir', thinkId: '2026-10-30-120000' });
  });

  it('廃止した [links:ID] は [link:ID] として読む', () => {
    expect(parseLinkTag('[links:2026-10-30-120000]')).toEqual({ tag: 'link', thinkId: '2026-10-30-120000' });
  });
});
