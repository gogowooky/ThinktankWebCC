import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ChatMessage } from '../../types';
import type { TTVault } from '../../models/TTVault';
import type { AiChatViewRef, AiModelSelectorProps } from '../ThinktankPanel/AiChatView';
import type { SupportPanel } from '../../services/thoughtSupport';
import './SupportChat.css';
import './SupportConversation.css';
import { SupportConversation } from './SupportConversation';

export interface SupportChatRef extends AiChatViewRef { abortStreaming: () => void; save: () => void }
interface Props {
  vault: TTVault; panelName: SupportPanel; selectedId: string; bundleId?: string;
  onSelected: (id: string) => void;
  onMessages: (messages: ChatMessage[]) => void;
  onWaiting: (waiting: boolean) => void;
  modelSelector: AiModelSelectorProps;
  onStartTask?: (chatId: string, title: string) => Promise<void>;
  pane?: boolean;
}

/** AIChat uses the Bundle selected by the existing upper list. Stored Chat files are left untouched. */
export const SupportChat = forwardRef<SupportChatRef, Props>(function SupportChat(props, ref) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props); callbacks.current = props;
  useEffect(() => {
    callbacks.current.onMessages([]); callbacks.current.onWaiting(false);
  }, []);
  useImperativeHandle(ref, () => ({
    focus: () => root.current?.querySelector<HTMLElement>('textarea')?.focus(),
    scrollToPrevUser: () => {}, scrollToNextUser: () => {},
    abortStreaming: () => { root.current?.querySelector<HTMLButtonElement>('[data-conversation-abort]')?.click(); },
    save: () => {},
  }), []);
  const scope = `aichat:${props.panelName}:${props.pane ? props.selectedId : 'panel'}`;
  const panel = props.panelName.toLowerCase();
  return <div ref={root} className="support-chat-host" style={{
    ['--support-content-bg' as string]: `var(--${panel}-content-bg)`,
    ['--support-toolbar-bg' as string]: `var(--${panel}-menuribbon-bg)`,
  }}>
    <SupportConversation vault={props.vault} panelName={props.panelName} bundleId={props.bundleId ?? ''} chatId={props.selectedId}
      draftScope={scope} onStartTask={props.onStartTask} />
  </div>;
});
