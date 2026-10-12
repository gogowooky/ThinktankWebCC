/**
 * bindingMemo.ts
 * キー設定・色設定・タグ設定の「読み込み元」の Vault メモ（ThinktankKeyBinding 等）を扱う共通処理。
 * Load はこのメモを読み、Save は現在の設定値をこのメモへ書き戻す。
 */
import type { TTApplication } from '../TTApplication';
import type { TTThink } from '../../models/TTThink';

/** タイトルが name のメモ（大文字小文字は区別しない） */
export function findBindingMemo(app: TTApplication, name: string): TTThink | undefined {
  return app.Models.Vault.GetThinks().find(t => t.Name.toLowerCase() === name.toLowerCase());
}

/**
 * 本文（タイトル行を除く）を name のメモへ保存する。メモが無ければ作る。
 * 既存メモのタイトル行はそのまま残す（Load がタイトルで探すため、書き換えない）。
 */
export async function writeBindingMemo(app: TTApplication, name: string, body: string): Promise<'created' | 'updated'> {
  const existing = findBindingMemo(app, name);
  if (existing) {
    await existing.LoadContent();
    const title = existing.Content.split('\n')[0] || name;
    existing.Content = `${title}\n${body}`;
    await existing.SaveContent();
    return 'updated';
  }
  const think = await app.Models.Vault.CreateBlankThink('memo', name);
  think.Content = `${name}\n${body}`;
  await think.SaveContent();
  return 'created';
}

export function writeResultMessage(label: string, name: string, result: 'created' | 'updated'): string {
  return result === 'created'
    ? `${label}を新しいメモ「${name}」に書き出しました`
    : `${label}を「${name}」に書き戻しました`;
}
