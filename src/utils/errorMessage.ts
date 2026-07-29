/**
 * errorMessage.ts
 * catch (err) の err は strict モードでは unknown 型になる。Error インスタンスとは
 * 限らない（文字列や任意の値が throw される可能性がある）ため、.message への
 * 安全なアクセスを提供する共通ヘルパー。
 */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
