import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { TTVault } from '../../models/TTVault';
import type { AiModelSelectorProps } from '../ThinktankPanel/AiChatView';
import type { SupportPanel } from '../../services/thoughtSupport';
import './SupportChat.css';
import './SupportConversation.css';
import { SupportConversation } from './SupportConversation';
import type { TaskSeed } from '../../services/taskSeed';

export interface SupportChatRef { focus: () => void; abortStreaming: () => void }
interface Props {
  vault: TTVault; panelName: SupportPanel; selectedId: string; bundleId?: string;
  modelSelector: AiModelSelectorProps;
  onStartTask?: (chatId: string, title: string, seed?: TaskSeed) => Promise<void>;
  pane?: boolean;
}

/** Chat-owned context stays stable when another panel changes its selection. */
export const SupportChat = forwardRef<SupportChatRef, Props>(function SupportChat(props, ref) {
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => root.current?.querySelector<HTMLElement>('textarea')?.focus(),
    abortStreaming: () => { root.current?.querySelector<HTMLButtonElement>('[data-conversation-abort]')?.click(); },
  }), []);
  const scope = `aichat:${props.panelName}:${props.pane ? props.selectedId : 'panel'}`;
  const panel = props.panelName.toLowerCase();
  return <div ref={root} className="support-chat-host" style={{
    ['--support-content-bg' as string]: `var(--${panel}-content-bg)`,
    ['--support-toolbar-bg' as string]: `var(--${panel}-menuribbon-bg)`,
  }}>
    <SupportConversation vault={props.vault} panelName={props.panelName} bundleId={props.bundleId ?? ''} chatId={props.selectedId}
      modelSelector={props.modelSelector}
      draftScope={scope} pane={props.pane} onStartTask={props.onStartTask} />
  </div>;
});
