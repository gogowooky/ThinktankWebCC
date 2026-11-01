/**
 * AiPanels.tsx
 * Thinktank / Seeds / Working / Harvest に共通の「AIView」「AIChat」サブパネル。
 * AIView はロード中の projectファイルの要約（# AIまとめ の先頭の AIViewファイル）を TextEditor で表示する。
 * AIViewファイルは AI CLI だけが書き、利用者は編集できない（読み取り専用）。
 * AIChat の中身は今後実装する。
 */

import { useEffect, useState } from 'react';
import { BotMessageSquare, CircleAlert, CircleCheck, LoaderCircle, type LucideIcon } from 'lucide-react';
import { CpuAi } from './CpuAi';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TextEditorMedia } from '../WorkingPanel/media/TextEditorMedia';
import { useEditorSettings } from '../WorkingPanel/media/useEditorSettings';
import { TextEditorModeButton } from '../Layout/TextEditorModeButton';
import {
  PROJECT_SUMMARIES, SUMMARY_KIND_OF_PANEL, findSummaryAiView, generateProjectSummary,
  type ProjectSummaryProgress, type SummaryPanelKey,
} from '../../services/projectSummary';
import '../Layout/MenuRibbon.css';
import './AiPanels.css';

function Placeholder({ Icon, name }: { Icon: LucideIcon; name: string }) {
  return (
    <div className="ai-panel" tabIndex={-1}>
      <Icon size={20} className="ai-panel__icon" />
      <span>{name}は今後追加予定です。</span>
    </div>
  );
}

// AIViewファイルは読み取り専用なので、エディタからの保存・変更通知は受けるだけにする
const ignoreSave = () => Promise.resolve();
const ignoreDirty = () => {};

/** パネルごとのロード中の projectファイル。Working / Harvest は自前で持たないので Seeds に従う */
function loadedProjectId(app: TTApplication, panelKey: SummaryPanelKey): string {
  if (panelKey === 'thinktank') return app.ThinktankPanel.ProjectID;
  return app.SeedsPanel.ProjectID;
}

// 要約の作成はサブパネルを切り替えても続くため、状況はコンポーネントの外にパネルごとに持つ
interface SummaryJob {
  projectId: string;
  startedAt: number;
  progress: ProjectSummaryProgress | null;
  /** 終わったら入る。done = AI CLI が書き込んだ、app = アプリが追記した */
  outcome?: { type: 'done' | 'app' | 'error'; message: string };
}
const summaryJobs = new Map<SummaryPanelKey, SummaryJob>();
const jobListeners = new Set<() => void>();
const notifyJobs = () => jobListeners.forEach(fn => fn());

function useSummaryJob(panelKey: SummaryPanelKey): SummaryJob | undefined {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick(n => n + 1);
    jobListeners.add(listener);
    return () => { jobListeners.delete(listener); };
  }, []);
  return summaryJobs.get(panelKey);
}

/** 作成中の経過秒数（1秒ごとに描き直す） */
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

function progressText(label: string, progress: ProjectSummaryProgress | null): string {
  if (!progress || progress.stage === 'collect') return `${label}: 対象ファイルを読み込んでいます…`;
  if (progress.stage === 'ai') return `${label}: AI CLI が対象ファイル ${progress.targetCount} 件を要約し、AIViewファイルへ書き込んでいます…`;
  return `${label}: AIViewファイルへの書き込みを確かめています…`;
}

async function runSummaryJob(panelKey: SummaryPanelKey, projectId: string) {
  const app = TTApplication.Instance;
  const kind = SUMMARY_KIND_OF_PANEL[panelKey];
  const label = PROJECT_SUMMARIES[kind].label;
  const job: SummaryJob = { projectId, startedAt: Date.now(), progress: null };
  summaryJobs.set(panelKey, job);
  notifyJobs();
  const seconds = () => Math.round((Date.now() - job.startedAt) / 1000);
  try {
    const result = await generateProjectSummary({
      kind, panelKey, vault: app.Models.Vault, projectId,
      onProgress: progress => { job.progress = progress; notifyJobs(); },
    });
    job.outcome = result.writtenBy === 'ai'
      ? { type: 'done', message: `${label}を AI CLI が書き込みました（${seconds()}秒）。` }
      : { type: 'app', message: `AI CLI が AIViewファイルへ書き込まなかったため、AI の回答をアプリが追記しました（${seconds()}秒）。` };
  } catch (e) {
    job.outcome = { type: 'error', message: `${label}を作成できませんでした: ${e instanceof Error ? e.message : String(e)}` };
  }
  notifyJobs();
}

/** テスト用。パネルごとの要約の状況を消す */
export function resetSummaryJobs() {
  summaryJobs.clear();
  notifyJobs();
}

export function AiViewPanel({ panelKey }: { panelKey: SummaryPanelKey }) {
  const app = TTApplication.Instance;
  const vault = app.Models.Vault;
  useAppUpdate(app.ThinktankPanel);
  useAppUpdate(app.SeedsPanel);
  useAppUpdate(vault);
  const editorSettings = useEditorSettings(app.WorkingPanel);

  const kind = SUMMARY_KIND_OF_PANEL[panelKey];
  const spec = PROJECT_SUMMARIES[kind];
  const projectId = loadedProjectId(app, panelKey);
  const project = projectId ? vault.GetThink(projectId) ?? null : null;
  const isProject = project?.ContentType === 'project';

  const anyJob = useSummaryJob(panelKey);
  const job = anyJob && anyJob.projectId === projectId ? anyJob : undefined;
  const running = !!anyJob && !anyJob.outcome;
  const elapsed = useElapsedSeconds(running && anyJob ? anyJob.startedAt : null);
  const [, setLoadCount] = useState(0);

  const aiView = isProject && project && !project.IsMetaOnly ? findSummaryAiView(vault, project) : null;
  // YAML＋本文 表示は、その AIViewファイルを表示している間だけ
  const [rawYamlThinkId, setRawYamlThinkId] = useState<string | null>(null);
  const rawYaml = !!aiView && rawYamlThinkId === aiView.ID;

  // projectファイル・AIViewファイルの本文が未取得なら読み込む（読み終えたら描き直す）
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (project && isProject && project.IsMetaOnly) await project.LoadContent();
      if (aiView?.IsMetaOnly) await aiView.LoadContent();
      if (!cancelled) setLoadCount(n => n + 1);
    };
    if ((project && isProject && project.IsMetaOnly) || aiView?.IsMetaOnly) void load();
    return () => { cancelled = true; };
  }, [project, isProject, aiView]);

  // 書き込まれた内容でエディタを作り直す
  const refreshKey = job?.outcome ? job.startedAt : 0;

  const handleGenerate = () => {
    if (!isProject || running) return;
    void runSummaryJob(panelKey, projectId);
  };

  let body: React.ReactNode;
  if (!isProject) {
    body = <div className="ai-panel">projectファイルがロードされていません。</div>;
  } else if (aiView && !aiView.IsMetaOnly) {
    body = (
      <TextEditorMedia
        key={`${aiView.ID}-${rawYaml ? 'raw-yaml' : 'text'}`}
        areaId={`${panelKey}-aiview`}
        think={aiView}
        vault={vault}
        onSave={ignoreSave}
        onDirtyChange={ignoreDirty}
        editorSettings={editorSettings}
        refreshKey={refreshKey}
        rawYaml={rawYaml}
      />
    );
  } else if (aiView || project?.IsMetaOnly) {
    body = <div className="ai-panel">読み込み中…</div>;
  } else {
    body = <div className="ai-panel">{spec.label}はまだありません。「{spec.label}」で作成します。</div>;
  }

  let status: React.ReactNode = null;
  if (running && anyJob) {
    const other = anyJob.projectId !== projectId ? '（別の projectファイル）' : '';
    status = (
      <div className="ai-view__status ai-view__status--running" role="status" aria-live="polite">
        <LoaderCircle size={14} className="ai-view__spin" />
        <span className="ai-view__status-text">{progressText(spec.label, anyJob.progress)}{other}</span>
        <span className="ai-view__elapsed">{elapsed}秒</span>
      </div>
    );
  } else if (job?.outcome) {
    const Icon = job.outcome.type === 'error' ? CircleAlert : CircleCheck;
    status = (
      <div
        className={`ai-view__status ai-view__status--${job.outcome.type}`}
        role={job.outcome.type === 'error' ? 'alert' : 'status'}
      >
        <Icon size={14} />
        <span className="ai-view__status-text">{job.outcome.message}</span>
      </div>
    );
  }

  return (
    <div className="ai-view" tabIndex={-1}>
      <div className={`menu-ribbon ai-view__ribbon ai-view__ribbon--${panelKey}`}>
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={handleGenerate}
          disabled={!isProject || running}
          data-tip={spec.label}
          data-tip-side="right"
          aria-label={spec.label}
        >
          <CpuAi size={14} className={running ? 'ai-view__busy' : undefined} />
        </button>
        <div className="menu-ribbon__spacer" />
        <TextEditorModeButton
          readOnly
          rawYaml={rawYaml}
          onChange={raw => setRawYamlThinkId(raw && aiView ? aiView.ID : null)}
        />
      </div>
      {status}
      <div className="ai-view__content">{body}</div>
    </div>
  );
}

export function AiChatPanel() {
  return <Placeholder Icon={BotMessageSquare} name="AIChat" />;
}
