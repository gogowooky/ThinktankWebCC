// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { externalDropDragKind, extractLinkDrop, parseWindowsUrlShortcut } from './WorkingMenuRibbon';

describe('parseWindowsUrlShortcut', () => {
  it('Internet Shortcut のURL行を大文字小文字を問わず読む', () => {
    expect(parseWindowsUrlShortcut('[InternetShortcut]\r\nURL=https://example.com/a\r\n')).toBe('https://example.com/a');
    expect(parseWindowsUrlShortcut('[InternetShortcut]\nurl = https://example.org/b\n')).toBe('https://example.org/b');
  });

  it('file URL は挿入・linkファイル用のWindowsパスへ直す', () => {
    expect(parseWindowsUrlShortcut('[InternetShortcut]\nURL=file:///C:/Users/test/a%20b.txt')).toBe('C:\\Users\\test\\a b.txt');
  });

  it('UTF-16由来のNUL交じりテキストも読む', () => {
    const utf16Like = '[InternetShortcut]\r\nURL=https://example.com/\r\n'.split('').join('\u0000');
    expect(parseWindowsUrlShortcut(utf16Like)).toBe('https://example.com/');
  });

  it('URL行が無い、または空ならnull', () => {
    expect(parseWindowsUrlShortcut('[InternetShortcut]\nIconIndex=0')).toBeNull();
    expect(parseWindowsUrlShortcut('[InternetShortcut]\nURL=  ')).toBeNull();
  });
});

describe('ブラウザURLのD&D', () => {
  const browserDrop = (withFile: boolean): React.DragEvent => ({
    dataTransfer: {
      types: withFile ? ['Files', 'text/uri-list', 'text/plain'] : ['text/uri-list', 'text/plain'],
      files: withFile ? [{ name: 'Example Domain.url' }] : [],
      items: [],
      getData: (type: string) => type === 'text/uri-list'
        ? 'https://example.com/page'
        : type === 'text/plain' ? 'Example Domain' : '',
    },
  } as unknown as React.DragEvent);

  it('Filesやタイトルが同時にあってもtext/uri-listのURLを優先する', () => {
    expect(extractLinkDrop(browserDrop(true))).toEqual({ url: 'https://example.com/page', title: 'page' });
  });

  it('ブラウザURLをLocalFileDragへ正規化する', () => {
    const event = browserDrop(false);
    expect(externalDropDragKind(event, extractLinkDrop(event))).toBe('LocalFileDrag');
  });
});

describe('ElectronローカルファイルのD&D', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('jpgを絶対pathのLocalFileDragとして認識する', () => {
    vi.stubGlobal('electronAPI', undefined);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getPathForFile: () => 'C:\\Users\\me\\Pictures\\photo.jpg' },
    });
    const event = {
      dataTransfer: {
        types: ['Files'],
        files: [{ name: 'photo.jpg' }],
        items: [{ webkitGetAsEntry: () => ({ isDirectory: false }) }],
        getData: () => '',
      },
    } as unknown as React.DragEvent;
    const link = extractLinkDrop(event);
    expect(link).toEqual({ url: 'C:\\Users\\me\\Pictures\\photo.jpg', title: 'photo' });
    expect(externalDropDragKind(event, link)).toBe('LocalFileDrag');
  });

  it('ディレクトリもLocalFileDragとして扱う', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getPathForFile: () => 'C:\\Users\\me\\Pictures' },
    });
    const event = {
      dataTransfer: {
        types: ['Files'],
        files: [{ name: 'Pictures' }],
        items: [{ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true }) }],
        getData: () => '',
      },
    } as unknown as React.DragEvent;
    const link = extractLinkDrop(event);
    expect(link?.url).toBe('C:\\Users\\me\\Pictures');
    expect(externalDropDragKind(event, link)).toBe('LocalFileDrag');
  });
});
