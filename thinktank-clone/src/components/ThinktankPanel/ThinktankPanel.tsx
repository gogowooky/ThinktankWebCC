// 左パネル：フィルタ、検索、Thoughts一覧、AI聞き取り（Thought作成）

import { useMemo, useState } from 'react';
import { app } from '../../views/TTApplication';
import { useNotify } from '../../hooks/useNotify';
import { VerticalTabBar, TabButton } from '../Layout/VerticalTabBar';
import {
  IconPanelLeft, IconList, IconBot, IconSettings, IconPlus, IconTrash,
  IconCheckAll, IconSquare, IconRefresh, IconCloud, IconCloudOff, IconSave,
  IconFile, IconTable, IconLink, IconChat, IconGraph,
} from '../Layout/Icons';
import { ChatView } from '../shared/ChatView';
import type { ChatMessage, ContentType } from '../../types';
import { parseDateRange, inDateRange } from '../../utils/dateUtils';
import { serializeChat } from '../../utils/thinkFormat';
import { THINK_POLICY_IDS } from '../../services/ThinkPolicies';
import '../Layout/MenuRibbon.css';
import '../Layout/PanelArea.css';
import './ThinktankPanel.css';

const TYPE_ICONS: Record<string, typeof IconFile> = {
  memo: IconFile,
  nettext: IconFile,
  thought: IconGraph,
  table: IconTable,
  links: IconLink,
  chat: IconChat,
};

export function ThinktankPanel() {
  useNotify(app, app.Vault);
  const open = app.ThinktankOpen;

  return (
    <div className="app-panel" data-focusable="Thinktank">
      <VerticalTabBar
        theme="thinktank"
        side="left"
        label="Thinktank"
        bottom={
          app.Mode === 'local' ? (
            <button
              className={`vertical-tab-bar__sync-toggle${app.CloudSyncEnabled ? ' vertical-tab-bar__sync-toggle--on' : ''}`}
              data-tip={`クラウド同期: ${app.CloudSyncEnabled ? 'on' : 'off'}`}
              data-tip-side="right"
              onClick={() => app.UIState.ApplyProperty('Application.CloudSyncEnabled', String(!app.CloudSyncEnabled))}
            >
              {app.CloudSyncEnabled ? <IconCloud size={15} /> : <IconCloudOff size={15} />}
            </button>
          ) : undefined
        }
      >
        <TabButton tip="パネル開閉" onClick={() => app.Actions.Execute('Panel.Thinktank.Toggle')}>
          <IconPanelLeft size={16} />
        </TabButton>
        <TabButton tip="一覧" active={app.ThinktankView === 'list'} onClick={() => { app.ThinktankView = 'list'; app.NotifyUpdated(false); }}>
          <IconList size={16} />
        </TabButton>
        <TabButton tip="AI（Thought作成の聞き取り）" active={app.ThinktankView === 'ai'} onClick={() => { app.ThinktankView = 'ai'; app.NotifyUpdated(false); }}>
          <IconBot size={16} />
        </TabButton>
        <TabButton tip="設定" active={app.ThinktankView === 'settings'} onClick={() => { app.ThinktankView = 'settings'; app.NotifyUpdated(false); }}>
          <IconSettings size={16} />
        </TabButton>
        {app.Vault.IsLoading && <div className="vertical-tab-bar__loading" />}
      </VerticalTabBar>

      <div className={`panel-area panel-area--thinktank${open ? '' : ' panel-area--closed'}`} style={{ width: open ? app.ThinktankWidth : 0 }}>
        <div className="panel-area__inner">
          {app.ThinktankView === 'list' && <ThinktankListView />}
          {app.ThinktankView === 'ai' && <ThinktankAiView />}
          {app.ThinktankView === 'settings' && <ThinktankSettingsView />}
        </div>
      </div>
    </div>
  );
}

// ── 一覧ビュー ──────────────────────────────────────────

function ThinktankListView() {
  useNotify(app.Vault);
  const [keyword, setKeyword] = useState('');
  const [updatedRange, setUpdatedRange] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const thinks = useMemo(() => {
    let list = app.Vault.Thinks.filter((t) => !t.ID.startsWith('__tt_'));
    if (typeFilter) list = list.filter((t) => t.ContentType === typeFilter);
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter((t) => `${t.Name} ${t.Keywords}`.toLowerCase().includes(kw));
    }
    if (updatedRange) {
      const range = parseDateRange(updatedRange);
      list = list.filter((t) => inDateRange(t.UpdateDate, range));
    }
    return list.sort((a, b) => b.UpdateDate.localeCompare(a.UpdateDate));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, updatedRange, typeFilter, app.Vault.Children.length, app.Vault.UpdateDate]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const deleteSelected = async () => {
    for (const id of selected) await app.Vault.DeleteThink(id);
    setSelected(new Set());
  };

  return (
    <>
      <div className="menu-ribbon menu-ribbon--thinktank">
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="新規Thought作成"
          onClick={() => { const t = app.NewThought(); app.SelectThought(t.ID); void app.OpenThink(t.ID); }}>
          <IconPlus size={13} />
        </button>
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="新規メモ作成"
          onClick={() => { const t = app.NewThink('memo'); void app.OpenThink(t.ID); }}>
          <IconFile size={13} />
        </button>
        <div className="menu-ribbon__sep" />
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="全選択"
          onClick={() => setSelected(new Set(thinks.map((t) => t.ID)))}>
          <IconCheckAll size={13} />
        </button>
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="選択解除"
          onClick={() => setSelected(new Set())}>
          <IconSquare size={13} />
        </button>
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="選択を削除"
          disabled={selected.size === 0} onClick={() => void deleteSelected()}>
          <IconTrash size={13} />
        </button>
        <div className="menu-ribbon__spacer" />
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="再読み込み"
          onClick={() => void app.Vault.LoadAll()}>
          <IconRefresh size={13} />
        </button>
      </div>

      <div className="thinktank-filter-panel">
        <input
          className="thinktank-filter-panel__input"
          placeholder="キーワード"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <input
          className="thinktank-filter-panel__input"
          placeholder="更新日（2026-06-01, -1w）"
          value={updatedRange}
          onChange={(e) => setUpdatedRange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <select
          className="thinktank-filter-panel__select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">すべての種類</option>
          <option value="memo">memo</option>
          <option value="thought">thought</option>
          <option value="table">table</option>
          <option value="chat">chat</option>
          <option value="links">links</option>
          <option value="nettext">nettext</option>
        </select>
      </div>

      <div className="thinktank-filter-view">
        {thinks.map((t) => {
          const Icon = TYPE_ICONS[t.ContentType] ?? IconFile;
          const isSelected = selected.has(t.ID);
          const isCurrent = app.SelectedThoughtId === t.ID;
          return (
            <div
              key={t.ID}
              className={`thinktank-filter-view__item${isSelected ? ' thinktank-filter-view__item--selected' : ''}${isCurrent ? ' thinktank-filter-view__item--current' : ''}${t.IsDirty ? ' thinktank-filter-view__item--dirty' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-thought-id', t.ID);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) toggleSelect(t.ID);
                else if (t.ContentType === 'thought') app.SelectThought(t.ID);
                else void app.OpenThink(t.ID);
              }}
              onDoubleClick={() => void app.OpenThink(t.ID)}
            >
              <span className="thinktank-filter-view__item-icon"><Icon size={12} /></span>
              <span className="thinktank-filter-view__item-title">{t.Name || '(無題)'}</span>
              <span className="thinktank-filter-view__item-date">{t.UpdateDate.slice(0, 10)}</span>
            </div>
          );
        })}
        {thinks.length === 0 && <div className="thinktank-filter-view__empty">該当するThinkがありません</div>}
      </div>
    </>
  );
}

// ── AIビュー（Thought作成の聞き取り）────────────────────

function ThinktankAiView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // AIの最後の回答から thought 形式ブロックを抽出して Thought を作成する
  const saveAsThought = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;
    const codeBlock = lastAssistant.content.match(/```[^\n]*\n([\s\S]*?)```/);
    const content = (codeBlock ? codeBlock[1] : lastAssistant.content).trim();
    if (!content) return;
    const t = app.NewThought(content);
    app.SelectThought(t.ID);
    app.StatusText = `Thought を作成しました: ${t.Name}`;
    app.NotifyUpdated(false);
  };

  const saveChatLog = () => {
    if (messages.length === 0) return;
    const title = `Thought聞き取り ${new Date().toLocaleString('ja-JP')}`;
    const think = app.Vault.NewThink('chat', serializeChat(title, messages));
    void app.Vault.SaveThink(think);
    app.StatusText = `チャットを保存しました: ${title}`;
    app.NotifyUpdated(false);
  };

  return (
    <>
      <div className="menu-ribbon menu-ribbon--thinktank">
        <span className="menu-ribbon__label">Thought作成の聞き取り</span>
        <div className="menu-ribbon__spacer" />
        <button className="menu-ribbon__btn" data-tip="聞き取り結果をThoughtとして作成" onClick={saveAsThought}>
          <IconPlus size={12} /> Thought化
        </button>
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="チャットを保存" onClick={saveChatLog}>
          <IconSave size={13} />
        </button>
      </div>
      <ChatView
        messages={messages}
        onMessagesChange={setMessages}
        systemPrompt={() => app.GetThinkPolicy('thinktank')}
        placeholder="整理したいテーマを教えてください。聞き取り後、Thought（Thinkファイルリスト）を作成します。"
        focusName="Thinktank.AiChat"
      />
    </>
  );
}

// ── 設定ビュー ──────────────────────────────────────────

function ThinktankSettingsView() {
  useNotify(app);
  return (
    <div className="thinktank-settings">
      <div className="thinktank-settings__title">Thinktank 設定</div>
      <label className="thinktank-settings__row">
        <span>クラウド同期</span>
        <input
          type="checkbox"
          checked={app.CloudSyncEnabled}
          onChange={(e) => app.UIState.ApplyProperty('Application.CloudSyncEnabled', String(e.target.checked))}
        />
      </label>
      <button
        className="thinktank-settings__btn"
        onClick={() => void app.OpenThink(THINK_POLICY_IDS.thinktank)}
      >
        AI方針（Thinkファイル）を編集
      </button>
      <button
        className="thinktank-settings__btn"
        onClick={() => void app.OpenThink('__tt_shortcuts__')}
      >
        ショートカット定義を編集
      </button>
      <button
        className="thinktank-settings__btn"
        onClick={() => void app.OpenThink('__tt_ui_state__')}
      >
        UI状態テーブルを開く
      </button>
    </div>
  );
}
