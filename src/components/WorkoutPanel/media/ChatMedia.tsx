import { forwardRef, useRef, useImperativeHandle } from 'react';
import type { MediaProps } from './types';
import { TTApplication } from '../../../views/TTApplication';
import { DEFAULT_AI_MODEL_SELECTION } from '../../../services/aiModels';
import { SupportChat, type SupportChatRef } from '../../ThoughtSupport/SupportChat';
import './ChatMedia.css';

export interface ChatMediaRef { focus: () => void }
export const ChatMedia = forwardRef<ChatMediaRef, MediaProps>(function ChatMedia({ think, onDirtyChange, aiChatModel, onAiChatModelChange }, ref) {
  const chat = useRef<SupportChatRef>(null);
  useImperativeHandle(ref, () => ({ focus: () => chat.current?.focus() }));
  if (!think) return null;
  return <div className="chat-media"><SupportChat ref={chat} pane vault={TTApplication.Instance.Models.Vault}
    panelName="Workout" selectedId={think.ID} onSelected={() => {}}
    onMessages={() => {}} onWaiting={() => onDirtyChange(false)}
    modelSelector={{ value: aiChatModel ?? DEFAULT_AI_MODEL_SELECTION, onChange: selection => onAiChatModelChange?.(selection) }} />
  </div>;
});
