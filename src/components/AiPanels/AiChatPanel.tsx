/**
 * AiChatPanel.tsx
 * AIChat サブパネル。ロード中の projectファイル（AIハーネス）の chat で、AI と対話し、作業の様子を見る。
 * 発言を送ると状態を「進行中」にしてループを始める（「始めて」もこの発言の一つ）。
 * AI が判断を求めると状態が「待機」になり、ここに質問が出るので返事を送る。
 */

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, CircleStop, LoaderCircle, Send } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { isHarnessProject, parseChat, parseProject, readProjectStatus } from '../../utils/thinkFormat';
import { HarnessLoop, type HarnessLoopStatus } from '../../services/harness/harnessLoop';
import { findHarnessChat } from '../../services/harness/harnessChat';
import { findHarnessAiWork } from '../../services/harness/harnessAiWork';
import type { HarnessTurnStage } from '../../services/harness/harnessRun';
import type { SummaryPanelKey } from '../../services/projectSummary';
import './AiChatPanel.css';

const STAGE_LABELS: Record<HarnessTurnStage, string> = {
  prepare: '記録と文脈を用意しています',
  ai: 'AI CLI が作業しています',
  verify: '記録が残ったかを確かめています',
  retry: '足りない記録の追記を依頼しています',
  record: '会話と記録を保存しています',
};

function loadedProjectId(app: TTApplication, panelKey: SummaryPanelKey): string {
  if (panelKey === 'thinktank') return app.ThinktankPanel.ProjectID;
  return app.SeedsPanel.ProjectID;
}

function useHarnessStatus(projectId: string): HarnessLoopStatus | undefined {
  const [, setTick] = useState(0);
  useEffect(() => HarnessLoop.subscribe(() => setTick(n => n + 1)), []);
  return projectId ? HarnessLoop.getStatus(projectId) : undefined;
}

function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function AiChatPanel({ panelKey }: { panelKey: SummaryPanelKey }) {
  const app = TTApplication.Instance;
  const vault = app.Models.Vault;
  useAppUpdate(app.ThinktankPanel);
  useAppUpdate(app.SeedsPanel);
  useAppUpdate(vault);

  const projectId = loadedProjectId(app, panelKey);
  const project = projectId ? vault.GetThink(projectId) ?? null : null;
  const isProject = project?.ContentType === 'project';
  const ready = isProject && !!project && !project.IsMetaOnly;
  const harness = ready && isHarnessProject(project.Content);
  const chat = harness ? findHarnessChat(vault, project) : null;
  const status = harness ? findHarnessAiWork(vault, project, 'status') : null;
  const loop = useHarnessStatus(projectId);
  const running = !!loop?.running;
  const elapsed = useElapsedSeconds(running && loop ? loop.startedAt : null);
  const [draft, setDraft] = useState('');
  const [, setLoadCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const pending = [project, chat, status].filter((t): t is NonNullable<typeof t> => !!t && t.IsMetaOnly);
    if (pending.length === 0) return;
    void Promise.all(pending.map(t => t.LoadContent())).then(() => { if (!cancelled) setLoadCount(n => n + 1); });
    return () => { cancelled = true; };
  }, [project, chat, status]);

  const messages = chat && !chat.IsMetaOnly ? parseChat(chat.Content.split(/\r?\n/).slice(1).join('\n')) : [];
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, running]);

  const send = () => {
    const text = draft.trim();
    if (!text || !harness || running) return;
    setDraft('');
    void HarnessLoop.start(vault, projectId, { userMessage: text, trigger: 'chat' });
  };
  const stop = () => { void HarnessLoop.requestStop(vault, projectId); };

  if (!isProject) return <div className="ai-panel">projectファイルがロードされていません。</div>;
  if (!ready) return <div className="ai-panel">読み込み中…</div>;
  if (!harness) {
    return (
      <div className="ai-panel">
        この projectファイルは AIハーネスを使っていません。projectファイルに「# 規約」（目的・ゴール・完了条件）を書くと、
        ここから AI に仕事を任せられます。
      </div>
    );
  }

  const title = parseProject(project.Content).title;
  const state = readProjectStatus(project.Content).state;
  const statusBody = status && !status.IsMetaOnly ? status.Content.split(/\r?\n/).slice(1).join('\n').trim() : '';

  let banner: React.ReactNode = null;
  if (running && loop) {
    banner = (
      <div className="ai-view__status ai-view__status--running" role="status" aria-live="polite">
        <LoaderCircle size={14} className="ai-view__spin" />
        <span className="ai-view__status-text">
          {loop.turn}/{loop.maxTurns}回目: {loop.stage ? STAGE_LABELS[loop.stage] : '始めています'}…
        </span>
        <span className="ai-view__elapsed">{elapsed}秒</span>
      </div>
    );
  } else if (loop?.outcome) {
    const isError = loop.outcome.type === 'error';
    const Icon = isError ? CircleAlert : CircleCheck;
    banner = (
      <div className={`ai-view__status ai-view__status--${isError ? 'error' : 'app'}`} role={isError ? 'alert' : 'status'}>
        <Icon size={14} />
        <span className="ai-view__status-text">{loop.outcome.message}</span>
      </div>
    );
  }

  return (
    <div className="ai-view ai-chat" tabIndex={-1}>
      <div className={`menu-ribbon ai-view__ribbon ai-view__ribbon--${panelKey}`}>
        <span className="ai-chat__title" data-tip={title}>{title}</span>
        <span className="ai-chat__state">［{state}］</span>
        <div className="menu-ribbon__spacer" />
        {running && (
          <button className="menu-ribbon__btn menu-ribbon__btn--icon" onClick={stop}
            data-tip="今の実行が終わったら止める（状態を保留にする）" data-tip-side="left" aria-label="止める">
            <CircleStop size={14} />
          </button>
        )}
      </div>
      {banner}
      {statusBody && (
        <details className="ai-chat__status">
          <summary>現在地（status）</summary>
          <div className="ai-chat__status-body">{statusBody}</div>
        </details>
      )}
      <div className="ai-chat__messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="ai-chat__empty">「始めて」と送るか、状態を「進行中」にして保存すると、AI が作業を始めます。</div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`ai-chat__message ai-chat__message--${m.role}`}>{m.content}</div>
        ))}
      </div>
      <div className="ai-chat__composer">
        <textarea
          className="ai-chat__input"
          value={draft}
          placeholder={running ? 'AI が作業中です…' : 'AI への返事・依頼（Ctrl+Enter で送信）'}
          disabled={running}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
          }}
          aria-label="AI への発言"
        />
        <button className="ai-chat__send" onClick={send} disabled={running || !draft.trim()} aria-label="送信" data-tip="送信">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
