/**
 * AiChatPanel.tsx
 * AIChat サブパネル。ロード中の projectファイル（AIハーネス）の chat で、AI と対話し、作業の様子を見る。
 * 発言を送ると状態を「進行中」にしてループを始める（「始めて」もこの発言の一つ）。
 * AI が判断を求めると状態が「待機」になり、ここに質問が出るので返事を送る。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, CircleStop, LoaderCircle, Send } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { isHarnessProject, isRootProjectTitle, parseChat, parseProject, readProjectStatus, THINK_ID_RE } from '../../utils/thinkFormat';
import { getErrorMessage } from '../../utils/errorMessage';
import { formatLocalDate } from '../../utils/aiViewFormat';
import { collectActivity, type ActivityEntry } from '../../services/harness/harnessReview';
import type { PanelRoleKey } from '../../../shared/domainProfile';
import type { AiChatProviderName } from '../../services/aiChatModelStatus';
import { HarnessLoop, type HarnessLoopStatus } from '../../services/harness/harnessLoop';
import { resolveHarnessCliFromProvider } from '../../services/harness/harnessRun';
import { findHarnessChat } from '../../services/harness/harnessChat';
import { findHarnessAiWork } from '../../services/harness/harnessAiWork';
import type { HarnessLoopStage } from '../../services/harness/harnessLoop';
import { boardRowLabel, readBoard } from '../../services/harness/harnessBoard';
import {
  CORRECTION_KIND_LABELS, correctionBasis, decideCorrection, pendingCorrections,
} from '../../services/harness/harnessCorrections';
import type { SummaryPanelKey } from '../../services/projectSummary';
import './AiChatPanel.css';
import { lastHarnessTiming } from '../../services/harness/harnessTiming';
import { formatHarnessTiming, type HarnessTimingReport } from '../../../shared/harnessTiming';

const STAGE_LABELS: Record<HarnessLoopStage, string> = {
  team: '担当が作業しています',
  prepare: '記録と文脈を用意しています',
  snapshots: '記録の版を確認しています',
  context: 'AIに渡す文脈を組み立てています',
  ai: 'AI CLI が作業しています',
  verify: '記録が残ったかを確かめています',
  retry: '足りない記録の追記を依頼しています',
  retryVerify: '追記の反映を確かめています',
  record: '会話と記録を保存しています',
};

function renderThinkReferences(text: string, open: (id: string) => void) {
  const parts: React.ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(/\[(?:(?:aiwork|aiview|chat|project|memo|think):)?([\w-]+)\]/gi)) {
    const id = match[1];
    if (!THINK_ID_RE.test(id)) continue;
    parts.push(text.slice(end, match.index));
    parts.push(<button key={match.index} type="button" className="ai-chat__think-ref"
      title="Workingで開く" onClick={() => open(id)}>{match[0]}</button>);
    end = match.index + match[0].length;
  }
  return parts.length ? [...parts, text.slice(end)] : text;
}

function TimingDetails({ report }: { report: HarnessTimingReport }) {
  const summary = useMemo(() => formatHarnessTiming(report), [report]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `harness-timing-${report.startedAt.replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <details className="ai-chat__status">
    <summary>直近の実行時間（{(report.totalMs / 1000).toFixed(1)}秒）</summary>
    <button type="button" onClick={download}>計測結果をJSONで保存</button>
    <div className="ai-chat__status-body">{summary}</div>
  </details>;
}

/** 日次一覧: その日にハーネスの log に書かれた記録。保存せず、開いたときに集める */
function DailyList({ vault, open }: { vault: TTApplication['Models']['Vault']; open: (id: string) => void }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    const today = formatLocalDate(new Date());
    setError(null);
    collectActivity(vault, today, today).then(setEntries, e => setError(e instanceof Error ? e.message : String(e)));
  };
  return (
    <details className="ai-chat__status" onToggle={e => { if ((e.target as HTMLDetailsElement).open) load(); }}>
      <summary>日次一覧（今日の記録）</summary>
      <div className="ai-chat__status-body">
        {error ? `読み込めませんでした: ${error}`
          : entries === null ? '読み込み中…'
            : entries.length === 0 ? '今日の記録はまだありません。'
              : entries.map(e => (
                <div key={`${e.logId}-${e.time}-${e.heading}`}>
                  {renderThinkReferences(`${e.time} 「${e.projectTitle}」 ${e.heading}${e.firstLine ? ': ' + e.firstLine : ''}`, open)}
                </div>
              ))}
      </div>
    </details>
  );
}

const PANEL_ROLE: Record<SummaryPanelKey, PanelRoleKey> = {
  thinktank: 'Thinktank',
  seeds: 'Seeds',
  working: 'Working',
  harvest: 'Harvest',
};

function providerNameOfPanel(app: TTApplication, panelKey: SummaryPanelKey): AiChatProviderName {
  if (panelKey === 'thinktank') return app.ThinktankPanel.AIChatProviderName;
  if (panelKey === 'working') return app.WorkingPanel.SettingAIChatProviderName;
  if (panelKey === 'harvest') return app.HarvestPanel.AIChatProviderName;
  return app.SeedsPanel.AIChatProviderName;
}

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
  const boardWork = harness ? findHarnessAiWork(vault, project, 'board') : null;
  const loop = useHarnessStatus(projectId);
  const timing = useMemo(() => loop?.timing ?? lastHarnessTiming(projectId), [projectId, loop?.timing]);
  const running = !!loop?.running;
  const elapsed = useElapsedSeconds(running && loop ? loop.startedAt : null);
  const [draft, setDraft] = useState('');
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState('');
  const lastOpen = useRef(0);
  useEffect(() => {
    setReferenceError('');
    return () => { lastOpen.current++; };
  }, [projectId]);
  const openReference = async (id: string) => {
    const request = ++lastOpen.current;
    setReferenceError('');
    try {
      const think = await vault.GetOrLoadThink(id);
      if (request !== lastOpen.current) return;
      if (!think) throw new Error('参照先のファイルが見つかりません。');
      if (!app.OpenThinkInWorking(think.ID)) throw new Error('Workingに表示する領域を開けませんでした。');
    } catch (error) {
      if (request === lastOpen.current) setReferenceError(`${id} を開けませんでした。 ${getErrorMessage(error)}`);
    }
  };
  const [, setLoadCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const pending = [project, chat, status, boardWork].filter((t): t is NonNullable<typeof t> => !!t && t.IsMetaOnly);
    if (pending.length === 0) return;
    void Promise.all(pending.map(t => t.LoadContent())).then(() => { if (!cancelled) setLoadCount(n => n + 1); });
    return () => { cancelled = true; };
  }, [project, chat, status, boardWork]);

  const messages = chat && !chat.IsMetaOnly ? parseChat(chat.Content.split(/\r?\n/).slice(1).join('\n')) : [];
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, running]);

  const send = () => {
    const text = draft.trim();
    if (!text || !harness || running) return;
    try {
      const { cliName, model } = resolveHarnessCliFromProvider(providerNameOfPanel(app, panelKey));
      setSendError(null);
      setDraft('');
      void HarnessLoop.start(vault, projectId, {
        userMessage: text,
        trigger: 'chat',
        cliName,
        model,
        panelRole: PANEL_ROLE[panelKey],
      });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    }
  };
  const stop = () => { void HarnessLoop.requestStop(vault, projectId); };
  const decide = async (id: string, decision: 'approve' | 'reject') => {
    if (!project || !chat || deciding) return;
    setDeciding(id);
    setDecisionError(null);
    try {
      await decideCorrection(vault, project, chat, id, decision);
    } catch (e) {
      setDecisionError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeciding(null);
    }
  };

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
  const pending = pendingCorrections(chat);
  const board = readBoard(boardWork && !boardWork.IsMetaOnly ? boardWork : null);

  let banner: React.ReactNode = null;
  if (running && loop) {
    banner = (
      <div className="ai-view__status ai-view__status--running" role="status" aria-live="polite">
        <LoaderCircle size={14} className="ai-view__spin" />
        <span className="ai-view__status-text">
          {loop.turn}/{loop.maxTurns}回目: {loop.stage ? STAGE_LABELS[loop.stage] : '始めています'}
          {loop.stage === 'team' && loop.teamRunning ? `（残り ${loop.teamRunning} 件）` : ''}…
        </span>
        <span className="ai-view__elapsed">{elapsed}秒</span>
      </div>
    );
  } else if (sendError) {
    banner = (
      <div className="ai-view__status ai-view__status--error" role="alert">
        <CircleAlert size={14} />
        <span className="ai-view__status-text">{sendError}</span>
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
      {referenceError && <div className="ai-chat__correction-error" role="alert">{referenceError}</div>}
      {timing && <TimingDetails report={timing} />}
      {statusBody && (
        <details className="ai-chat__status">
          <summary>現在地（status）</summary>
          <div className="ai-chat__status-body">{renderThinkReferences(statusBody, openReference)}</div>
        </details>
      )}
      {isRootProjectTitle(project.Name) && <DailyList vault={vault} open={openReference} />}
      {board.rows.length > 0 && (
        <details className="ai-chat__status ai-chat__board">
          <summary>共有ボード（{board.rows.filter(r => r.state === 'verified').length}/{board.rows.length} 件 検証済み）</summary>
          <div className="ai-chat__status-body">
            {board.goal && <div>ゴール: {renderThinkReferences(board.goal, openReference)}</div>}
            {board.rows.map(r => (
              <div key={r.id} className={`ai-chat__board-row ai-chat__board-row--${r.state}`}>
                {renderThinkReferences(`${r.id} ［${boardRowLabel(r.state)}］ ${r.role}: ${r.task}`, openReference)}
              </div>
            ))}
          </div>
        </details>
      )}
      {pending.length > 0 && (
        <div className="ai-chat__corrections" aria-label="訂正の提案">
          <div className="ai-chat__corrections-title">訂正の提案（承認すると次回から使われます）</div>
          {pending.map(c => (
            <div key={c.id} className="ai-chat__correction">
              <div className="ai-chat__correction-text">
                <span className="ai-chat__correction-kind">{CORRECTION_KIND_LABELS[c.kind]}</span>
                {renderThinkReferences(c.text, openReference)}
                <div className="ai-chat__correction-quote">
                  {renderThinkReferences(correctionBasis(c) + (c.reason ? ` ／ ${c.reason}` : ''), openReference)}
                </div>
              </div>
              <div className="ai-chat__correction-actions">
                <button onClick={() => void decide(c.id, 'approve')} disabled={!!deciding || running}>承認</button>
                <button onClick={() => void decide(c.id, 'reject')} disabled={!!deciding || running}>見送る</button>
              </div>
            </div>
          ))}
          {decisionError && <div className="ai-chat__correction-error" role="alert">{decisionError}</div>}
        </div>
      )}
      <div className="ai-chat__messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="ai-chat__empty">「始めて」と送るか、状態を「進行中」にして保存すると、AI が作業を始めます。</div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`ai-chat__message ai-chat__message--${m.role}`}>{renderThinkReferences(m.content, openReference)}</div>
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
