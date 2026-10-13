import { forwardRef, useRef, useImperativeHandle, useEffect } from 'react';
import type { MediaProps } from './types';
import { TTApplication } from '../../../views/TTApplication';
import { DEFAULT_AI_MODEL_SELECTION } from '../../../services/aiModels';
import { SupportChat, type SupportChatRef } from '../../ThoughtSupport/SupportChat';
import './ChatMedia.css';

export interface ChatMediaRef { focus: () => void }
export const ChatMedia = forwardRef<ChatMediaRef, MediaProps>(function ChatMedia({ think, onDirtyChange, aiChatModel, onAiChatModelChange }, ref) {
  const chat = useRef<SupportChatRef>(null);
  useImperativeHandle(ref, () => ({ focus: () => chat.current?.focus() }));
  useEffect(() => {
    if (think) onDirtyChange(false);
  }, [think, onDirtyChange]);
  if (!think) return null;
  return <div className="chat-media"><SupportChat ref={chat} pane vault={TTApplication.Instance.Models.Vault}
    panelName="Discuss" selectedId={think.ID} bundleId={TTApplication.Instance.SeedsPanel.BundleID}
    modelSelector={{ value: aiChatModel ?? DEFAULT_AI_MODEL_SELECTION, onChange: selection => onAiChatModelChange?.(selection) }} />
  </div>;
});
