/**
 * apiClient.ts
 * 旧HTTP API向けの互換ヘルパー。
 *
 * 旧版との互換用。v2.6のAI CLI通信はPC連携ON時のE2EE経路を使い、
 * この平文APIは通常の画面フローから呼ばれない。
 */

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, init);
}

export { readApiJson } from './apiResponse';
