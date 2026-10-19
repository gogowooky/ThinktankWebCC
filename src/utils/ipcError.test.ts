import { describe, expect, it } from 'vitest';
import { invokeIpc, stripIpcErrorPrefix } from './ipcError';

describe('ipcError', () => {
  it('removes the Electron IPC prefix and the error class name', () => {
    expect(
      stripIpcErrorPrefix("Error invoking remote method 'ai:conversation': AiCliError: AI CLI がこの PC に見つかりません。"),
    ).toBe('AI CLI がこの PC に見つかりません。');
    expect(stripIpcErrorPrefix("Error invoking remote method 'x': Error: 失敗")).toBe('失敗');
    expect(stripIpcErrorPrefix('普通のエラー')).toBe('普通のエラー');
  });

  it('rethrows IPC failures with the cleaned message', async () => {
    await expect(
      invokeIpc(() => Promise.reject(new Error("Error invoking remote method 'ai:agent': AiCliError: 実行に失敗しました"))),
    ).rejects.toThrow(/^実行に失敗しました$/);
    await expect(invokeIpc(() => Promise.resolve(42))).resolves.toBe(42);
  });
});
