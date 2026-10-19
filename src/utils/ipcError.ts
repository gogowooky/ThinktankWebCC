/**
 * src/utils/ipcError.ts
 * Electron の IPC（ipcRenderer.invoke）で投げ返された例外は、メッセージの先頭に
 * "Error invoking remote method 'ai:conversation': AiCliError: " のような前置きが付く。
 * 利用者に見せるのはメインプロセスが書いた本文だけにする。
 */

const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/;

export function stripIpcErrorPrefix(message: string): string {
  return message.replace(IPC_PREFIX, '');
}

/** IPC を呼び、失敗したら前置きを除いたメッセージの Error として投げ直す。 */
export async function invokeIpc<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    // Electron は IPC の失敗を必ず Error で返すので、それ以外はそのまま投げ直す
    if (e instanceof Error) e.message = stripIpcErrorPrefix(e.message);
    throw e;
  }
}
