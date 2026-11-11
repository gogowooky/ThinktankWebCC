/**
 * deviceId.ts
 * この端末の id。Thinkファイル保存時の metadata.savedDeviceId と、linkファイルの「# 作成端末」に記録する。
 *
 * - Electron 版: PC名（OSのホスト名。例 `MYPC`）。取れなければ `pc-win` のようにOSで代える。
 * - ブラウザ版: PC名を知る手段が無いため、OSとブラウザから決める。
 *   PC は `web-<OS>-<ブラウザ>`（例 `web-win-chrome`、`web-mac-safari`）、
 *   モバイルは `mobile-<OS>`（例 `mobile-ios`、`mobile-android`）。
 *   同じ種類の端末（Windows の Chrome 2台など）は同じ id になる。
 */

import { getPcName } from './pcName';

export interface UserAgentInfo {
  userAgent: string;
  /** Chromium 系の navigator.userAgentData.platform（例 "Windows"、"macOS"、"Android"） */
  platform?: string;
  /** Chromium 系の navigator.userAgentData.mobile */
  mobile?: boolean;
  /** navigator.maxTouchPoints。iPad の Safari は Mac と名乗るため、タッチ対応かで見分ける */
  maxTouchPoints?: number;
}

type OsName = 'win' | 'mac' | 'linux' | 'chromeos' | 'ios' | 'ipados' | 'android' | 'other';

const MOBILE_OS: readonly OsName[] = ['ios', 'ipados', 'android'];

function osOf(info: UserAgentInfo): OsName {
  const ua = info.userAgent;
  if (/iPhone|iPod/.test(ua)) return 'ios';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (info.maxTouchPoints ?? 0) > 1)) return 'ipados';
  if (/Android/.test(ua)) return 'android';
  switch ((info.platform ?? '').toLowerCase()) {
    case 'windows': return 'win';
    case 'macos': return 'mac';
    case 'linux': return 'linux';
    case 'chrome os':
    case 'chromeos': return 'chromeos';
    case 'android': return 'android';
    case 'ios': return 'ios';
  }
  if (/Windows/.test(ua)) return 'win';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/CrOS/.test(ua)) return 'chromeos';
  if (/Linux/.test(ua)) return 'linux';
  return 'other';
}

/** 判定の順番に意味がある（Edge・Opera の UA には Chrome も、Chrome の UA には Safari も含まれる） */
function browserOf(userAgent: string): string {
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return 'edge';
  if (/OPR\/|Opera/.test(userAgent)) return 'opera';
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'firefox';
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'chrome';
  if (/Safari\//.test(userAgent)) return 'safari';
  return 'other';
}

/** OS とブラウザから端末の id を作る（PC名が分からないとき用） */
export function deviceIdFromUserAgent(info: UserAgentInfo): string {
  const os = osOf(info);
  if (info.mobile || MOBILE_OS.includes(os)) return `mobile-${os}`;
  return `web-${os}-${browserOf(info.userAgent)}`;
}

function currentUserAgentInfo(): UserAgentInfo {
  if (typeof navigator === 'undefined') return { userAgent: '' };
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }).userAgentData;
  return {
    userAgent: navigator.userAgent ?? '',
    ...(uaData?.platform ? { platform: uaData.platform } : {}),
    ...(typeof uaData?.mobile === 'boolean' ? { mobile: uaData.mobile } : {}),
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}

let cached: Promise<string> | null = null;
let resolved = '';

async function resolveDeviceId(): Promise<string> {
  if (typeof window === 'undefined') return '';
  if (window.electronAPI) {
    const pcName = (await getPcName().catch(() => '')).trim();
    if (pcName) return pcName;
    // PC名が取れなければ OS だけでも残す（例 pc-win）
    return deviceIdFromUserAgent(currentUserAgentInfo()).replace(/^web-([^-]+)-.*$/, 'pc-$1');
  }
  return deviceIdFromUserAgent(currentUserAgentInfo());
}

/** この端末の id。取得できない環境（テスト等で window が無い）では空文字 */
export function getDeviceId(): Promise<string> {
  cached ??= resolveDeviceId()
    .catch(() => '')
    .then(id => { resolved = id; return id; });
  return cached;
}

/** 取得済みの id を待たずに返す（まだ取得していなければ空文字） */
export function peekDeviceId(): string {
  return resolved;
}

/** テスト用: キャッシュを捨てる */
export function resetDeviceIdCacheForTest(): void {
  cached = null;
  resolved = '';
}
