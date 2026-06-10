// 中央左パネル：選択中Thoughtのデータグリッド、関係グラフ、AIチャット

import { useMemo, useState } from 'react';
import { app } from '../../views/TTApplication';
import { useNotify } from '../../hooks/useNotify';
import { VerticalTabBar, TabButton } from '../Layout/VerticalTabBar';
import {
  IconPanelLeft, IconGrid, IconGraph, IconBot, IconSettings, IconPlus,
  IconCheckAll, IconSquare, IconX, IconSave,
} from '../Layout/Icons';
import { ChatView } from '../shared/ChatView';
import type { ChatMessage } from '../../types';
import type { TTThink } from '../../models/TTThink';
import { parseThought, serializeThought, serializeChat } from '../../utils/thinkFormat';
import { THINK_POLICY_IDS } from '../../services/ThinkPolicies';
import '../Layout/MenuRibbon.css';
import '../Layout/PanelArea.css';
import './OverviewPanel.css';

export function OverviewPanel() {
  useNotify(app, app.Vault);
  const open = app.OverviewOpen;
  const thought = app.SelectedThought;

  return (
    <div className="app-panel" data-focusable="Overview">
      <VerticalTabBar theme="overview" side="left" label="Overview">
        <TabButton tip="パネル開閉" onClick={() => app.Actions.Execute('Panel.Overview.Toggle')}>
          <IconPanelLeft size={16} />
        </TabButton>
        <TabButton tip="Think一覧" active={app.OverviewView === 'grid'} onClick={() => { app.OverviewView = 'grid'; app.NotifyUpdated(false); }}>
          <IconGrid size={16} />
        </TabButton>
        <TabButton tip="関係グラフ" active={app.OverviewView === 'graph'} onClick={() => { app.OverviewView = 'graph'; app.NotifyUpdated(false); }}>
          <IconGraph size={16} />
        </TabButton>
        <TabButton tip="AIチャット（概要と過不足の議論）" active={app.OverviewView === 'chat'} onClick={() => { app.OverviewView = 'chat'; app.NotifyUpdated(false); }}>
          <IconBot size={16} />
        </TabButton>
        <TabButton tip="設定" active={app.OverviewView === 'settings'} onClick={() => { app.OverviewView = 'settings'; app.NotifyUpdated(false); }}>
          <IconSettings size={16} />
        </TabButton>
      </VerticalTabBar>

      <div className={`panel-area panel-area--overview${open ? '' : ' panel-area--closed'}`} style={{ width: open ? app.OverviewWidth : 0 }}>
        <div className="panel-area__inner">
          <div className="overview-thought-bar" title={thought?.Name}>
            {thought ? thought.Name : 'Thought未選択（Thinktankパネルで選択）'}
          </div>
          {app.OverviewView === 'grid' && <OverviewGridView thought={thought} />}
          {app.OverviewView === 'graph' && <OverviewGraphView thought={thought} />}
          {app.OverviewView === 'chat' && <OverviewChatView thought={thought} />}
          {app.OverviewView === 'settings' && <OverviewSettingsView />}
        </div>
      </div>
    </div>
  );
}

function useThoughtThinks(thought: TTThink | undefined): TTThink[] {
  useNotify(app.Vault, thought ?? null);
  return useMemo(
    () => (thought ? app.Vault.FilterByThought(thought) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thought, thought?.Content, app.Vault.UpdateDate, app.Vault.Children.length],
  );
}

// ── グリッド一覧 ────────────────────────────────────────

function OverviewGridView({ thought }: { thought: TTThink | undefined }) {
  const thinks = useThoughtThinks(thought);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = keyword
    ? thinks.filter((t) => `${t.Name} ${t.Keywords}`.toLowerCase().includes(keyword.toLowerCase()))
    : thinks;

  // 選択中ThoughtからThinkを除外（明示IDリストから削除）
  const excludeSelected = async () => {
    if (!thought || selected.size === 0) return;
    const parsed = parseThought(thought.Content);
    parsed.ids = parsed.ids.filter((id) => !selected.has(id));
    thought.Content = serializeThought(parsed);
    await app.Vault.SaveThink(thought);
    setSelected(new Set());
  };

  return (
    <>
      <div className="menu-ribbon menu-ribbon--overview">
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="新規Thought作成"
          onClick={() => { const t = app.NewThought(); app.SelectThought(t.ID); }}>
          <IconPlus size={13} />
        </button>
        <div className="menu-ribbon__sep" />
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="全選択"
          onClick={() => setSelected(new Set(filtered.map((t) => t.ID)))}>
          <IconCheckAll size={13} />
        </button>
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="選択解除"
          onClick={() => setSelected(new Set())}>
          <IconSquare size={13} />
        </button>
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="選択をThoughtから除外"
          disabled={!thought || selected.size === 0} onClick={() => void excludeSelected()}>
          <IconX size={13} />
        </button>
      </div>

      <div className="overview-search-bar">
        <input
          className="overview-search-bar__input"
          placeholder="Thought内を検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="overview-grid">
        {filtered.map((t) => (
          <div
            key={t.ID}
            className={`overview-grid__row${selected.has(t.ID) ? ' overview-grid__row--selected' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-thought-id', t.ID);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                const next = new Set(selected);
                if (next.has(t.ID)) next.delete(t.ID);
                else next.add(t.ID);
                setSelected(next);
              } else {
                void app.OpenThink(t.ID);
              }
            }}
          >
            <span className="overview-grid__type">{t.ContentType}</span>
            <span className="overview-grid__title">{t.Name || '(無題)'}</span>
            <span className="overview-grid__date">{t.UpdateDate.slice(5, 10)}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="overview-grid__empty">
            {thought ? '条件に一致するThinkがありません' : 'ThinktankパネルでThoughtを選択してください'}
          </div>
        )}
      </div>
    </>
  );
}

// ── 関係グラフ ──────────────────────────────────────────

function OverviewGraphView({ thought }: { thought: TTThink | undefined }) {
  const thinks = useThoughtThinks(thought);
  const W = 400;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 60;

  return (
    <div className="overview-graph">
      {!thought && <div className="overview-grid__empty">Thoughtを選択してください</div>}
      {thought && (
        <svg viewBox={`0 0 ${W} ${H}`} className="overview-graph__svg">
          {thinks.map((t, i) => {
            const angle = (2 * Math.PI * i) / Math.max(1, thinks.length) - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            return (
              <g key={t.ID} onClick={() => void app.OpenThink(t.ID)} style={{ cursor: 'pointer' }}>
                <line x1={cx} y1={cy} x2={x} y2={y} className="overview-graph__edge" />
                <circle cx={x} cy={y} r={14} className="overview-graph__node" />
                <text x={x} y={y + 26} textAnchor="middle" className="overview-graph__label">
                  {(t.Name || t.ID).slice(0, 8)}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={22} className="overview-graph__center" />
          <text x={cx} y={cy + 38} textAnchor="middle" className="overview-graph__center-label">
            {(thought.Name || '').slice(0, 12)}
          </text>
        </svg>
      )}
    </div>
  );
}

// ── AIチャット（概要と過不足の議論）─────────────────────

function OverviewChatView({ thought }: { thought: TTThink | undefined }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const buildContext = async (): Promise<string> => {
    if (!thought) return '';
    await app.Vault.EnsureContent(thought.ID);
    const thinks = app.Vault.FilterByThought(thought);
    const parts = [`[Context: Thought ${thought.ID}]`, thought.Content, '', '--- 含まれるThink一覧 ---'];
    for (const t of thinks.slice(0, 30)) {
      await app.Vault.EnsureContent(t.ID);
      parts.push(`■ ${t.Name} (${t.ContentType}, ${t.UpdateDate.slice(0, 10)})`);
      parts.push(t.Content.split('\n').slice(0, 10).join('\n'), '');
    }
    return parts.join('\n');
  };

  const saveChatLog = () => {
    if (messages.length === 0) return;
    const title = `Overview議論 ${thought?.Name ?? ''} ${new Date().toLocaleString('ja-JP')}`;
    const think = app.Vault.NewThink('chat', serializeChat(title, messages));
    void app.Vault.SaveThink(think);
    app.StatusText = `チャットを保存しました: ${title}`;
    app.NotifyUpdated(false);
  };

  return (
    <>
      <div className="menu-ribbon menu-ribbon--overview">
        <span className="menu-ribbon__label">概要と過不足の議論</span>
        <div className="menu-ribbon__spacer" />
        <button className="menu-ribbon__btn menu-ribbon__btn--icon" data-tip="チャットを保存" onClick={saveChatLog}>
          <IconSave size={13} />
        </button>
      </div>
      <ChatView
        messages={messages}
        onMessagesChange={setMessages}
        systemPrompt={() => app.GetThinkPolicy('overview')}
        buildContext={buildContext}
        placeholder={thought ? `「${thought.Name}」の概要や過不足について質問してください` : 'Thoughtを選択してください'}
        focusName="Overview.AiChat"
      />
    </>
  );
}

// ── 設定ビュー ──────────────────────────────────────────

function OverviewSettingsView() {
  return (
    <div className="overview-settings">
      <div className="overview-settings__title">Overview 設定</div>
      <button className="overview-settings__btn" onClick={() => void app.OpenThink(THINK_POLICY_IDS.overview)}>
        AI方針（Thinkファイル）を編集
      </button>
      {app.SelectedThoughtId && (
        <button className="overview-settings__btn" onClick={() => void app.OpenThink(app.SelectedThoughtId)}>
          選択中のThought定義を編集
        </button>
      )}
    </div>
  );
}
