/**
 * linkTitleService.ts
 * GDrive のファイル名・フォルダー名、GMail の件名を、利用者自身が公開した
 * Google Apps Script（scripts/gas/linkTitle.gs）に問い合わせて取得する。
 * Thinktank の OAuth クライアントに Gmail/Drive の権限を足さずに済むよう、
 * 読み取りは利用者の権限で動く GAS 側で行う。手順は docs/261108/GASリンクタイトル取得.md。
 */

import { linkTagNameOf } from '../utils/linkFormat';

const STORAGE_KEY_URL = 'thinktank.linkTitleGas.url';
const STORAGE_KEY_TOKEN = 'thinktank.linkTitleGas.token';
const DEFAULT_TIMEOUT_MS = 8000;

export interface LinkTitleGasConfig {
  url: string;
  token: string;
}

export function getLinkTitleGasConfig(): LinkTitleGasConfig {
  try {
    return {
      url: localStorage.getItem(STORAGE_KEY_URL) ?? '',
      token: localStorage.getItem(STORAGE_KEY_TOKEN) ?? '',
    };
  } catch {
    return { url: '', token: '' };
  }
}

export function saveLinkTitleGasConfig(config: LinkTitleGasConfig): void {
  localStorage.setItem(STORAGE_KEY_URL, config.url.trim());
  localStorage.setItem(STORAGE_KEY_TOKEN, config.token.trim());
}

/** 公開URLは script.google.com の /macros/s/.../exec だけを受け付ける（合言葉を他所へ送らない） */
export function isValidGasUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && u.hostname === 'script.google.com' && /^\/macros\/s\/[^/]+\/exec$/.test(u.pathname);
  } catch {
    return false;
  }
}

export type LinkTitleRequest =
  | { kind: 'drive'; id: string }
  | { kind: 'gmailThread'; id: string }
  | { kind: 'gmailMessage'; id: string };

const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const HEX_ID_RE = /^[0-9a-f]{16}$/i;
// 新しいGmailのURL（#inbox/FMfcg…）は、母音を除いた40文字でエンコードされている
const GMAIL_TOKEN_CHARSET = 'BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz';

/**
 * 新しいGmailのURLトークンを旧形式（16進）のスレッドIDへ戻す。
 * トークンは「f:{10進のスレッドID}」をバイト列として40進にしたもの（公開されている解析結果に基づく）。
 * thread-a 等の変換できない形式は null。
 */
export function decodeGmailUrlToken(token: string): string | null {
  if (!token || [...token].some(c => !GMAIL_TOKEN_CHARSET.includes(c))) return null;
  let n = 0n;
  for (const c of token) n = n * 40n + BigInt(GMAIL_TOKEN_CHARSET.indexOf(c));
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  const decoded = String.fromCharCode(...bytes);
  const match = decoded.match(/^(?:thread-)?f:(\d+)$/);
  return match ? BigInt(match[1]).toString(16) : null;
}

function decimalIdToHex(value: string | null): string | null {
  const match = value?.match(/^(?:thread|msg)-f:(\d+)$/);
  return match ? BigInt(match[1]).toString(16) : null;
}

function gmailRequestOf(url: URL): LinkTitleRequest | null {
  // 「元のメッセージを表示」「印刷」等の URL はクエリにIDを持つ
  const permThread = decimalIdToHex(url.searchParams.get('permthid'));
  if (permThread) return { kind: 'gmailThread', id: permThread };
  const permMessage = decimalIdToHex(url.searchParams.get('permmsgid'));
  if (permMessage) return { kind: 'gmailMessage', id: permMessage };
  const th = url.searchParams.get('th');
  if (th && HEX_ID_RE.test(th)) return { kind: 'gmailThread', id: th.toLowerCase() };

  const last = url.hash.replace(/^#/, '').split(/[/?]/).filter(Boolean).pop() ?? '';
  if (HEX_ID_RE.test(last)) return { kind: 'gmailThread', id: last.toLowerCase() };
  const decoded = decodeGmailUrlToken(last);
  return decoded ? { kind: 'gmailThread', id: decoded } : null;
}

function driveRequestOf(url: URL): LinkTitleRequest | null {
  const segments = url.pathname.split('/').filter(Boolean);
  for (const marker of ['d', 'folders']) {
    const index = segments.indexOf(marker);
    const id = index >= 0 ? segments[index + 1] : undefined;
    if (id && DRIVE_ID_RE.test(id)) return { kind: 'drive', id };
  }
  const id = url.searchParams.get('id');
  return id && DRIVE_ID_RE.test(id) ? { kind: 'drive', id } : null;
}

/** リンク先のURLから、GAS へ問い合わせる内容を決める。対象外なら null */
export function linkTitleRequestOf(target: string): LinkTitleRequest | null {
  const tag = linkTagNameOf(target);
  if (tag !== 'gmail' && tag !== 'gdrive') return null;
  let url: URL;
  try { url = new URL(target.trim()); } catch { return null; }
  return tag === 'gmail' ? gmailRequestOf(url) : driveRequestOf(url);
}

interface GasResponse { ok?: boolean; title?: unknown; error?: unknown }

/**
 * GAS からタイトルを取る。未設定・対象外・失敗・時間切れはいずれも undefined
 * （linkファイルの作成は止めず、Caption は Affiliation の値に倒す）。
 */
export async function fetchLinkTitle(target: string, options: { timeoutMs?: number } = {}): Promise<string | undefined> {
  const request = linkTitleRequestOf(target);
  if (!request) return undefined;
  const config = getLinkTitleGasConfig();
  if (!config.token || !isValidGasUrl(config.url)) return undefined;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS) : null;
  try {
    // text/plain にして CORS のプリフライトを避ける（GAS のウェブアプリは OPTIONS に応答しない）
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: config.token, ...request }),
      redirect: 'follow',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) return undefined;
    const data = await res.json() as GasResponse;
    if (!data.ok || typeof data.title !== 'string') {
      if (typeof data.error === 'string') console.warn('[linkTitle] GAS:', data.error);
      return undefined;
    }
    return data.title.replace(/\s+/g, ' ').trim() || undefined;
  } catch (error) {
    console.warn('[linkTitle] GAS への問い合わせに失敗しました:', error);
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 設定画面の「接続テスト」。合言葉が合っているかだけを確かめる */
export async function testLinkTitleGas(config: LinkTitleGasConfig): Promise<{ ok: boolean; message: string }> {
  if (!isValidGasUrl(config.url)) return { ok: false, message: 'URLは https://script.google.com/macros/s/…/exec の形で入力してください。' };
  if (!config.token.trim()) return { ok: false, message: '合言葉を入力してください。' };
  try {
    const res = await fetch(config.url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: config.token.trim(), kind: 'ping' }),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const data = await res.json() as GasResponse;
    return data.ok
      ? { ok: true, message: '接続できました。' }
      : { ok: false, message: typeof data.error === 'string' ? data.error : '応答を読めませんでした。' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
