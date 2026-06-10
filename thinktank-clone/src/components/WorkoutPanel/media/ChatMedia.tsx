// AI対話ログメディア：chat Think を表示・継続（Thoughtをコンテキストに議論）

import { useMemo } from 'react';
import type { TTThink } from '../../../models/TTThink';
import { app } from '../../../views/TTApplication';
import { useNotify } from '../../../hooks/useNotify';
import { ChatView } from '../../shared/ChatView';
import { parseChat, serializeChat } from '../../../utils/thinkFormat';
import type { ChatMessage } from '../../../types';
import './ChatMedia.css';

export function ChatMedia({ think }: { think: TTThink }) {
  useNotify(think);
  const { title, messages } = useMemo(
    () => parseChat(think.Content),
    [think.Content],
  );

  const onMessagesChange = (next: ChatMessage[]) => {
    think.Content = serializeChat(title || think.Name || '対話', next);
    think.NotifyUpdated(false);
  };

  // Workout方針: Thoughtファイル（Overviewで選択中）をコンテキストとして議論する
  const buildContext = async (): Promise<string> => {
    const thought = app.SelectedThought;
    if (!thought) return '';
    await app.Vault.EnsureContent(thought.ID);
    return `[Context: Thought ${thought.ID}]\n${thought.Content}`;
  };

  return (
    <div className="chat-media">
      <ChatView
        messages={messages}
        onMessagesChange={onMessagesChange}
        systemPrompt={() => app.GetThinkPolicy('workout')}
        buildContext={buildContext}
        placeholder={
          app.SelectedThought
            ? `「${app.SelectedThought.Name}」をコンテキストとして議論します`
            : 'AIと議論します（ThoughtをThinktankパネルで選択するとコンテキストに含まれます）'
        }
        focusName="Workout.Chat"
      />
    </div>
  );
}
