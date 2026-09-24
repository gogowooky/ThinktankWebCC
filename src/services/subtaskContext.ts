import type { TTVault } from '../models/TTVault';
import { readTaskRelation } from './taskRelation';
import { readSubtaskProgress } from './subtaskProgress';
import { validateSubtaskContext, type SubtaskContext } from '../../server/services/subtaskContext';

/** Only loaded direct children; never fetch their bodies or follow their references. */
export function captureSubtaskContext(vault: TTVault, parentId: string): SubtaskContext {
  const items: SubtaskContext['items'] = vault.GetBundles()
    .filter(child => child.ID !== parentId && readTaskRelation(child.Metadata.taskRelation)?.parentId === parentId)
    .sort((a, b) => a.ID.localeCompare(b.ID))
    .map(child => {
      const base = { bundleId: child.ID, title: child.Name };
      if (child.IsDirty || child.IsMetadataDirty) return { ...base, status: 'unsaved' as const };
      const progress = readSubtaskProgress(child.Metadata.thinkProgress);
      if (progress.status !== 'recorded') return { ...base, status: progress.status };
      const { id, revision, author, confirmedAt, input } = progress.event;
      const { milestones, paused, evidence, remaining, resumeSummary, resumeCondition, reviewAt, sources } = input;
      return { ...base, status: progress.status, event: structuredClone({ id, revision, author, confirmedAt,
        input: { milestones, paused, evidence, remaining, resumeSummary, resumeCondition, reviewAt, sources } }) };
    });
  const value: SubtaskContext = { scope: 'loaded-direct-children', items };
  validateSubtaskContext(value, parentId);
  return value;
}
