import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pcName = vi.hoisted(() => ({ value: '' as string | Error }));
vi.mock('./pcName', () => ({
  getPcName: async () => {
    if (pcName.value instanceof Error) throw pcName.value;
    return pcName.value;
  },
}));

import { deviceIdFromUserAgent, getDeviceId, peekDeviceId, resetDeviceIdCacheForTest } from './deviceId';

const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iPhoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  electronWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) thinktank/2.6.17 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36',
};

describe('deviceIdFromUserAgent', () => {
  it('PC は web-<OS>-<ブラウザ>', () => {
    expect(deviceIdFromUserAgent({ userAgent: UA.winChrome })).toBe('web-win-chrome');
    expect(deviceIdFromUserAgent({ userAgent: UA.winEdge })).toBe('web-win-edge');
    expect(deviceIdFromUserAgent({ userAgent: UA.winFirefox })).toBe('web-win-firefox');
    expect(deviceIdFromUserAgent({ userAgent: UA.macSafari })).toBe('web-mac-safari');
    expect(deviceIdFromUserAgent({ userAgent: UA.macChrome })).toBe('web-mac-chrome');
    expect(deviceIdFromUserAgent({ userAgent: UA.linuxChrome })).toBe('web-linux-chrome');
  });

  it('モバイルは mobile-<OS>（ブラウザは問わない）', () => {
    expect(deviceIdFromUserAgent({ userAgent: UA.iPhone })).toBe('mobile-ios');
    expect(deviceIdFromUserAgent({ userAgent: UA.iPhoneChrome })).toBe('mobile-ios');
    expect(deviceIdFromUserAgent({ userAgent: UA.android })).toBe('mobile-android');
  });

  it('Mac と名乗る iPad はタッチ対応で見分ける', () => {
    expect(deviceIdFromUserAgent({ userAgent: UA.macSafari, maxTouchPoints: 5 })).toBe('mobile-ipados');
    expect(deviceIdFromUserAgent({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe('web-mac-safari');
  });

  it('userAgentData の platform / mobile があればそれを使う', () => {
    expect(deviceIdFromUserAgent({ userAgent: UA.linuxChrome, platform: 'Chrome OS' })).toBe('web-chromeos-chrome');
    expect(deviceIdFromUserAgent({ userAgent: UA.winChrome, platform: 'Windows', mobile: false })).toBe('web-win-chrome');
    expect(deviceIdFromUserAgent({ userAgent: UA.linuxChrome, platform: 'Android', mobile: true })).toBe('mobile-android');
  });

  it('分からなければ other', () => {
    expect(deviceIdFromUserAgent({ userAgent: '' })).toBe('web-other-other');
  });
});

describe('getDeviceId', () => {
  beforeEach(() => {
    resetDeviceIdCacheForTest();
    pcName.value = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetDeviceIdCacheForTest();
  });

  it('Electron 版は PC名を使う', async () => {
    pcName.value = 'MYPC';
    vi.stubGlobal('window', { electronAPI: {} });
    vi.stubGlobal('navigator', { userAgent: UA.electronWin, maxTouchPoints: 0 });
    expect(await getDeviceId()).toBe('MYPC');
    expect(peekDeviceId()).toBe('MYPC');
  });

  it('Electron 版で PC名が取れなければ pc-<OS>', async () => {
    pcName.value = new Error('ipc');
    vi.stubGlobal('window', { electronAPI: {} });
    vi.stubGlobal('navigator', { userAgent: UA.electronWin, maxTouchPoints: 0 });
    expect(await getDeviceId()).toBe('pc-win');
  });

  it('ブラウザ版は OS とブラウザから決める', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: UA.macSafari, maxTouchPoints: 0 });
    expect(await getDeviceId()).toBe('web-mac-safari');
  });
});
