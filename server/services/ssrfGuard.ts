/**
 * ssrfGuard.ts
 * AI ツール（fetchUrlContent）や Links 作成が外部 URL を取得する際の SSRF 対策。
 * PROJECT_REVIEW_REPORT.md D-4。
 *
 * - http/https 以外を拒否
 * - 名前解決した全 IP がプライベート/予約/ループバック/リンクローカル帯なら拒否
 *   （Cloud Run のメタデータサーバー 169.254.169.254 や VPC 内部への到達を塞ぐ）
 * - リダイレクトは呼び出し側が manual で辿り、ホップごとにこの検証を通すこと
 *
 * 限界: undici の fetch は接続時に再度名前解決するため DNS リバインドを完全には防げない。
 * ただし検証時点でブロック帯に解決されるホストは弾けるため、内部探索の壁としては有効。
 */

import { lookup } from 'node:dns/promises';
import net from 'node:net';

// ── IPv4 ────────────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  const p = ip.split('.').map(Number);
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

function inCidr(ipInt: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (ipv4ToInt(base) & mask);
}

// RFC1918 / ループバック / リンクローカル / CGN / ドキュメント用 / マルチキャスト / 予約
const BLOCKED_V4_CIDRS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
];

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4_CIDRS.some((c) => inCidr(n, c));
}

// ── IPv6 ────────────────────────────────────────────────────────────────────

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4-mapped (::ffff:a.b.c.d) は埋め込み v4 で判定
  const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 ULA
  if (lower.startsWith('2001:db8')) return true; // ドキュメント用
  if (lower.startsWith('ff')) return true; // ff00::/8 マルチキャスト
  return false;
}

/** プライベート・予約帯の IP か（パース不能なら安全側で true = ブロック扱い） */
export function isBlockedIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) return isBlockedIpv6(ip);
  return true;
}

/**
 * URL が取得を許可される公開先か検証する。ダメなら Error を投げ、OK なら正規化した URL を返す。
 * リダイレクト先の検証は呼び出し側がホップごとに再度これを呼ぶこと。
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL の形式が不正です');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('http/https のみ対応します');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  // ホスト名が IP リテラルならそのまま判定
  if (net.isIP(host)) {
    if (isBlockedIp(host)) {
      throw new Error('プライベート/予約アドレスへのアクセスは許可されていません');
    }
    return parsed;
  }

  // 名前解決して全結果を検証
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error('ホスト名を解決できませんでした');
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) {
    throw new Error('プライベート/予約アドレスへのアクセスは許可されていません');
  }

  return parsed;
}
