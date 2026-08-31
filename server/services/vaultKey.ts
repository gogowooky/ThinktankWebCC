/**
 * vaultKey.ts
 * thinktank.vault の file_id / category の検証。
 * PROJECT_REVIEW_REPORT.md D-5: 書き込み口が HTTP ルートと AI ツールの 2 つあり、
 * 後者が無検証だった。検証を 1 箇所に集約し両方から使う。
 */

/**
 * file_id に使える文字。パストラバーサル（"../"）・空白・Unicode を弾く。
 * 日付 ID（yyyy-MM-dd-HHmmss）とそのサフィックス（-memo, -a3f9 等）、
 * システム think（__tt_ui_state__）を通す。
 */
export const SAFE_FILE_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

/** category に使える値（src/types/index.ts の ContentType と一致させること） */
export const VALID_CATEGORIES = ['memo', 'bundle', 'table', 'links', 'chat', 'nettext'] as const;
export type VaultCategory = (typeof VALID_CATEGORIES)[number];

export function isValidFileId(fileId: unknown): fileId is string {
  return typeof fileId === 'string' && SAFE_FILE_ID_RE.test(fileId);
}

export function isValidCategory(category: unknown): category is VaultCategory {
  return typeof category === 'string' && (VALID_CATEGORIES as readonly string[]).includes(category);
}

export type VaultKeyCheck = { ok: true } | { ok: false; error: string };

/**
 * 書き込み前の検証。`isDeleted` 時は tombstone なので category を問わない
 * （既存の BigQueryService.delete が category='' で save を呼ぶため）。
 */
export function validateVaultKey(
  fileId: unknown,
  category: unknown,
  opts: { isDeleted?: boolean } = {},
): VaultKeyCheck {
  if (!isValidFileId(fileId)) {
    return { ok: false, error: `file_id が不正です: ${JSON.stringify(fileId)}` };
  }
  if (!opts.isDeleted && !isValidCategory(category)) {
    return {
      ok: false,
      error: `category が不正です: ${JSON.stringify(category)}（許可: ${VALID_CATEGORIES.join('/')}）`,
    };
  }
  return { ok: true };
}

/**
 * AI が渡してくる ID の正規化。前後の空白と角括弧（`[2026-...-memo]` のような表記）を外す。
 */
export function normalizeThinkId(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^\[+|\]+$/g, '').trim();
}

/**
 * Bundle 本文中の `* [<think-id>]` 表記から角括弧を外す（AI が付けがちなため）。
 * ID らしき文字列（日付 + 任意サフィックス）だけを対象にし、他の `[...]` はそのまま残す。
 */
export function stripBracketedIdsInBundleContent(content: string): string {
  return content.replace(/\[(\d{4}-\d{2}-\d{2}-\d{6}(?:-[A-Za-z0-9]+)?)\]/g, '$1');
}
