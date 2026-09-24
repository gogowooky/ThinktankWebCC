import type { TTVault } from '../models/TTVault';
import type { TTThink } from '../models/TTThink';
import { readTaskRelation } from './taskRelation';
import { readSubtaskProgress } from './subtaskProgress';
import { validateSubtaskContext, type SubtaskContext, type ProgressContext } from '../../server/services/subtaskContext';

export function captureProgressContext(think: TTThink): ProgressContext {
  if (think.IsDirty || think.IsMetadataDirty) return { status: 'unsaved' };
  const progress = readSubtaskProgress(think.Metadata.thinkProgress);
  if (progress.status !== 'recorded') return { status: progress.status };
  const { id, revision, author, confirmedAt, input } = progress.event;
  const { milestones, paused, evidence, remaining, resumeSummary, resumeCondition, reviewAt, sources } = input;
  return { status: 'recorded', event: structuredClone({ id, revision, author, confirmedAt,
    input: { milestones, paused, evidence, remaining, resumeSummary, resumeCondition, reviewAt, sources } }) };
}

/** Only loaded direct children; never fetch their bodies or follow their references. */
export function captureSubtaskContext(vault: TTVault, parentId: string): SubtaskContext {
  const items: SubtaskContext['items'] = vault.GetBundles()
    .filter(child => child.ID !== parentId && readTaskRelation(child.Metadata.taskRelation)?.parentId === parentId)
    .sort((a, b) => a.ID.localeCompare(b.ID))
    .map(child => ({ bundleId: child.ID, title: child.Name, ...captureProgressContext(child) }));
  const value: SubtaskContext = { scope: 'loaded-direct-children', items };
  validateSubtaskContext(value, parentId);
  return value;
}
