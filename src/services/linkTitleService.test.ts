// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeGmailUrlToken,
  fetchLinkTitle,
  isValidGasUrl,
  linkTitleRequestOf,
  saveLinkTitleGasConfig,
} from './linkTitleService';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxABC/exec';

describe('linkTitleRequestOf', () => {
  it('GDrive のURLからファイル・フォルダのIDを取り出す', () => {
    expect(linkTitleRequestOf('https://drive.google.com/file/d/1AbCdEfGhIjK_-x/view?usp=sharing')).toEqual({ kind: 'drive', id: '1AbCdEfGhIjK_-x' });
    expect(linkTitleRequestOf('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit#gid=0')).toEqual({ kind: 'drive', id: '1AbCdEfGhIjKlMn' });
    expect(linkTitleRequestOf('https://drive.google.com/drive/u/0/folders/1FolderIdXyz123')).toEqual({ kind: 'drive', id: '1FolderIdXyz123' });
    expect(linkTitleRequestOf('https://drive.google.com/open?id=1OpenIdAbc12345')).toEqual({ kind: 'drive', id: '1OpenIdAbc12345' });
    expect(linkTitleRequestOf('https://drive.google.com/drive/my-drive')).toBeNull();
  });

  it('GMail は旧形式・新形式・クエリのIDを扱う', () => {
    expect(linkTitleRequestOf('https://mail.google.com/mail/u/0/#inbox/1672c124d784ff7c')).toEqual({ kind: 'gmailThread', id: '1672c124d784ff7c' });
    expect(linkTitleRequestOf('https://mail.google.com/mail/u/0/#inbox/FMfcgxvzLhhSPCtzSXwHlfFgGQtTjVKn')).toEqual({ kind: 'gmailThread', id: '1672c124d784ff7c' });
    expect(linkTitleRequestOf('https://mail.google.com/mail/u/0/?ik=abc&view=om&permmsgid=msg-f:1617567580158230396')).toEqual({ kind: 'gmailMessage', id: '1672c124d784ff7c' });
    expect(linkTitleRequestOf('https://mail.google.com/mail/u/0/#inbox')).toBeNull();
  });

  it('GDrive・GMail 以外は問い合わせない', () => {
    expect(linkTitleRequestOf('https://example.com/file/d/1AbCdEfGhIjK/view')).toBeNull();
    expect(linkTitleRequestOf('C:\\a\\b.md')).toBeNull();
  });
});

describe('decodeGmailUrlToken', () => {
  it('公開されている解析例と一致する', () => {
    expect(decodeGmailUrlToken('FMfcgxvzLhhSPCtzSXwHlfFgGQtTjVKn')).toBe('1672c124d784ff7c');
  });
  it('復元できない値は null', () => {
    expect(decodeGmailUrlToken('inbox')).toBeNull();
    expect(decodeGmailUrlToken('BCDFG')).toBeNull();
  });
});

describe('isValidGasUrl', () => {
  it('script.google.com の /macros/s/…/exec だけを受け付ける', () => {
    expect(isValidGasUrl(GAS_URL)).toBe(true);
    expect(isValidGasUrl('https://script.google.com.evil.test/macros/s/x/exec')).toBe(false);
    expect(isValidGasUrl('http://script.google.com/macros/s/x/exec')).toBe(false);
    expect(isValidGasUrl('https://script.google.com/macros/s/x/dev')).toBe(false);
  });
});

describe('fetchLinkTitle', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('未設定なら問い合わせない', async () => {
    expect(await fetchLinkTitle('https://drive.google.com/file/d/1AbCdEfGhIjK/view')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('合言葉と種別・IDを text/plain で送り、タイトルを返す', async () => {
    saveLinkTitleGasConfig({ url: GAS_URL, token: 'secret' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, title: ' 見積書.pdf ' }) });
    expect(await fetchLinkTitle('https://drive.google.com/file/d/1AbCdEfGhIjK/view')).toBe('見積書.pdf');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GAS_URL);
    expect(init.headers['Content-Type']).toContain('text/plain');
    expect(JSON.parse(init.body)).toEqual({ token: 'secret', kind: 'drive', id: '1AbCdEfGhIjK' });
  });

  it('GAS がエラーを返したり通信に失敗したら undefined', async () => {
    saveLinkTitleGasConfig({ url: GAS_URL, token: 'secret' });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, error: 'not found' }) });
    expect(await fetchLinkTitle('https://drive.google.com/file/d/1AbCdEfGhIjK/view')).toBeUndefined();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchLinkTitle('https://drive.google.com/file/d/1AbCdEfGhIjK/view')).toBeUndefined();
  });
});
