import { useEffect, useRef, useState } from 'react';
import type { TTVault } from '../models/TTVault';
import { NEW_CHAT_SENTINEL_ID } from '../utils/thinkFormat';

/** A new Chat is saved before selection; late completion must not steal another selection. */
export function useNewSupportChat(vault: TTVault, onSelected: (id: string) => void) {
  const current = useRef({ vault, onSelected }); current.current = { vault, onSelected };
  const version = useRef(0);
  const active = useRef(true);
  const pending = useRef(false);
  const [state, setState] = useState({ vault, creating: false, error: '' });
  useEffect(() => {
    version.current++;
    active.current = true;
    return () => { active.current = false; };
  }, [vault]);

  async function select(id: string) {
    if (id !== NEW_CHAT_SENTINEL_ID) {
      version.current++;
      setState({ vault, creating: pending.current, error: '' });
      onSelected(id);
      return;
    }
    if (pending.current) return;
    pending.current = true;
    const request = ++version.current;
    setState({ vault, creating: true, error: '' });
    try {
      const chat = await vault.CreateBlankThink('chat', 'ASK:Thinktank｜新しい相談');
      if (active.current && current.current.vault === vault && request === version.current) {
        current.current.onSelected(chat.ID);
      }
    } catch (e) {
      if (active.current && current.current.vault === vault && request === version.current) {
        setState({ vault, creating: false, error: `Chatを作成できませんでした。${(e as Error).message} 「新規チャット」から再試行できます。` });
      }
    } finally {
      pending.current = false;
      if (active.current && current.current.vault === vault) setState(previous => ({ ...previous, creating: false }));
    }
  }
  return { select, creating: state.vault === vault && state.creating, error: state.vault === vault ? state.error : '' };
}
