// 右パネル：AI対話 CLI（本日のUpdate概要まとめ）

import { useState } from 'react';
import { app } from '../../views/TTApplication';
import { useNotify } from '../../hooks/useNotify';
import { VerticalTabBar, TabButton } from '../Layout/VerticalTabBar';
import { IconPanelLeft, IconBot, IconSettings, IconSave, IconActivity } from '../Layout/Icons';
import { ChatView } from '../shared/ChatView';
import type { ChatMessage } from '../../types';
import { isToday } from '../../utils/dateUtils';
import { serializeChat } from '../../utils/thinkFormat';
import { THINK_POLICY_IDS } from '../../services/ThinkPolicies';
import '../Layout/MenuRibbon.css';
import '../Layout/PanelArea.css';
import './ReThinkPanel.css';

export function ReThinkPanel() {
  useNotify(app, app.Vault);
  const open = app.ReThinkOpen;
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // 本日のUpdate部分をコンテキストとして構築（ReThink方針）
  const buildContext = async (): Promise<string> => {
    const todays = app.Vault.Thinks.filter(
      (t) => !t.ID.startsWith('__tt_') && isToday(t.UpdateDate),
    );
    if (todays.length === 0) return '[Context: 本日更新されたThinkはありません]';
    const parts = ['[Context: 本日更新されたThink一覧]'];
    for (const t of todays.slice(0, 30)) {
      await app.Vault.EnsureContent(t.ID);
      parts.push(`■ ${t.Name} (${t.ContentType}, 更新 ${t.UpdateDate.slice(0, 16)})`);
      parts.push(t.Content.split('\n').slice(0, 15).join('\n'), '');
    }
    return parts.join('\n');
  };

  const summarizeToday = () => {
    setMessages((prev) => prev); // 表示中履歴は維持
    // 入力なしでまとめを依頼するクイックアクション
    const ask: ChatMessage = { role: 'user', content: '本日のUpdate部分の概要をまとめてください。' };
    void (async () => {
      const { streamChat } = await import('../../services/ChatApiService');
      const history = [...messages, ask];
      setMessages(history);
      let acc = '';
      const context = await buildContext();
      await streamChat(
        [{ role: 'user', content: context }, { role: 'assistant', content: '（本日の更新内容を把握しました）' }, ...history],
        app.GetThinkPolicy('rethink'),
        {
          onDelta: (t) => {
            acc += t;
            setMessages([...history, { role: 'assistant', content: acc }]);
          },
          onDone: () => setMessages([...history, { role: 'assistant', content: acc }]),
          onError: (m) => setMessages([...history, { role: 'assistant', content: `⚠ ${m}` }]),
        },
      );
    })();
  };

  const saveChatLog = () => {
    if (messages.length === 0) return;
    const title = `ReThink ${new Date().toLocaleDateString('ja-JP')}`;
    const think = app.Vault.NewThink('chat', serializeChat(title, messages));
    void app.Vault.SaveThink(think);
    app.StatusText = `チャットを保存しました: ${title}`;
    app.NotifyUpdated(false);
  };

  const contextLabel = app.SelectedThought
    ? `連携中: ${app.SelectedThought.Name}`
    : '連携中のThoughtなし';

  return (
    <div className="app-panel" data-focusable="ReThink">
      <div className={`panel-area panel-area--rethink${open ? '' : ' panel-area--closed'}`} style={{ width: open ? app.ReThinkWidth : 0 }}>
        <div className="panel-area__inner">
          {app.ReThinkView === 'chat' && (
            <>
              <div className="menu-ribbon menu-ribbon--rethink">
                <button className="menu-ribbon__btn" data-tip="本日更新されたThinkの概要をまとめる" onClick={summarizeToday}>
                  <IconActivity size={12} /> 本日のまとめ
                </button>
                <div className="menu-ribbon__spacer" />
                <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="チャットを保存" onClick={saveChatLog}>
                  <IconSave size={13} />
                </button>
              </div>
              <div className="rethink-context-bar" title={contextLabel}>{contextLabel}</div>
              <ChatView
                messages={messages}
                onMessagesChange={setMessages}
                systemPrompt={() => app.GetThinkPolicy('rethink')}
                buildContext={buildContext}
                placeholder="本日のUpdateについて質問するか、「本日のまとめ」を押してください"
                terminal
                focusName="ReThink.Chat"
              />
            </>
          )}
          {app.ReThinkView === 'settings' && (
            <div className="rethink-settings">
              <div className="rethink-settings__title">ReThink 設定</div>
              <button className="rethink-settings__btn" onClick={() => void app.OpenThink(THINK_POLICY_IDS.rethink)}>
                AI方針（Thinkファイル）を編集
              </button>
            </div>
          )}
        </div>
      </div>

      <VerticalTabBar theme="rethink" side="right" label="ReThink">
        <TabButton tip="パネル開閉" tipSide="left" onClick={() => app.Actions.Execute('Panel.ReThink.Toggle')}>
          <IconPanelLeft size={16} />
        </TabButton>
        <TabButton tip="AI相談" tipSide="left" active={app.ReThinkView === 'chat'} onClick={() => { app.ReThinkView = 'chat'; app.NotifyUpdated(false); }}>
          <IconBot size={16} />
        </TabButton>
        <TabButton tip="設定" tipSide="left" active={app.ReThinkView === 'settings'} onClick={() => { app.ReThinkView = 'settings'; app.NotifyUpdated(false); }}>
          <IconSettings size={16} />
        </TabButton>
      </VerticalTabBar>
    </div>
  );
}
