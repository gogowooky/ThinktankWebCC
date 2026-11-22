/**
 * harnessWatcher.ts
 * AIハーネスを使う project の # 状態 が、保存された内容で「進行中」に変わったらループを始める。
 * 起動時にすでに進行中だった project は、見えた時点の状態として控えるだけで始めない（勝手に走り出さないため）。
 * 点検（harness-doctor）は常駐させず、Vault が読み込まれた後とループが終わった後に、期限が来ていれば行う。
 * AI CLI を動かせる PC版だけで使う。
 */

import type { TTVault } from '../../models/TTVault';
import { isHarnessProject, readProjectStatus } from '../../utils/thinkFormat';
import { HarnessLoop, lockedByOther } from './harnessLoop';
import { maybeRunHarnessDoctor } from './harnessDoctor';

const DEBOUNCE_MS = 300;

export interface HarnessWatcherOptions {
  /** テスト用。省略時は HarnessLoop.start */
  start?: (projectId: string) => void;
  /** テスト用。省略時は期限が来ていれば点検する */
  doctor?: () => void;
  debounceMs?: number;
}

export function startHarnessWatcher(vault: TTVault, options: HarnessWatcherOptions = {}): () => void {
  const seen = new Map<string, string>();
  const start = options.start ?? (projectId => { void HarnessLoop.start(vault, projectId, { trigger: 'state' }); });
  const doctor = options.doctor ?? (() => { void maybeRunHarnessDoctor(vault); });
  let doctorChecked = false;
  const scan = () => {
    const projects = vault.GetProjects();
    for (const project of projects) {
      // 本文未取得・編集中（未保存）の状態は、保存された状態とは言えない
      if (project.IsMetaOnly || project.IsDirty) continue;
      const state = readProjectStatus(project.Content).state;
      const previous = seen.get(project.ID);
      seen.set(project.ID, state);
      if (previous === undefined || previous === state || state !== '進行中') continue;
      if (!isHarnessProject(project.Content) || HarnessLoop.isRunning(project.ID) || lockedByOther(project)) continue;
      start(project.ID);
    }
    if (!doctorChecked && projects.length > 0) {
      doctorChecked = true;
      doctor();
    }
  };
  scan();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const key = `harnessWatcher-${Math.random().toString(36).slice(2)}`;
  vault.AddOnUpdate(key, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; scan(); }, options.debounceMs ?? DEBOUNCE_MS);
  });
  const running = new Set<string>();
  const unsubscribe = HarnessLoop.subscribe(() => {
    for (const p of vault.GetProjects()) {
      const isRunning = HarnessLoop.isRunning(p.ID);
      if (isRunning) running.add(p.ID);
      else if (running.delete(p.ID)) doctor();
    }
  });
  return () => {
    if (timer) clearTimeout(timer);
    vault.RemoveOnUpdate(key);
    unsubscribe();
  };
}
