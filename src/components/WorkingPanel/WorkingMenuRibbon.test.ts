import { describe, expect, it } from 'vitest';
import { parseWindowsUrlShortcut } from './WorkingMenuRibbon';

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
