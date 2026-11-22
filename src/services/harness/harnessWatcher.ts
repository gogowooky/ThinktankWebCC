/**
 * harnessWatcher.ts
 * AIハーネスを使う project の # 状態 が、保存された内容で「進行中」に変わったらループを始める。
 * 起動時にすでに進行中だった project は、見えた時点の状態として控えるだけで始めない（勝手に走り出さないため）。
 * AI CLI を動かせる PC版だけで使う。
 */

import type { TTVault } from '../../models/TTVault';
import { isHarnessProject, readProjectStatus } from '../../utils/thinkFormat';
import { HarnessLoop, lockedByOther } from './harnessLoop';

const DEBOUNCE_MS = 300;

export interface HarnessWatcherOptions {
  /** テスト用。省略時は HarnessLoop.start */
  start?: (projectId: string) => void;
  debounceMs?: number;
}

export function startHarnessWatcher(vault: TTVault, options: HarnessWatcherOptions = {}): () => void {
  const seen = new Map<string, string>();
  const start = options.start ?? (projectId => { void HarnessLoop.start(vault, projectId, { trigger: 'state' }); });
  const scan = () => {
    for (const project of vault.GetProjects()) {
      // 本文未取得・編集中（未保存）の状態は、保存された状態とは言えない
      if (project.IsMetaOnly || project.IsDirty) continue;
      const state = readProjectStatus(project.Content).state;
      const previous = seen.get(project.ID);
      seen.set(project.ID, state);
      if (previous === undefined || previous === state || state !== '進行中') continue;
      if (!isHarnessProject(project.Content) || HarnessLoop.isRunning(project.ID) || lockedByOther(project)) continue;
      start(project.ID);
    }
  };
  scan();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const key = `harnessWatcher-${Math.random().toString(36).slice(2)}`;
  vault.AddOnUpdate(key, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; scan(); }, options.debounceMs ?? DEBOUNCE_MS);
  });
  return () => {
    if (timer) clearTimeout(timer);
    vault.RemoveOnUpdate(key);
  };
}
