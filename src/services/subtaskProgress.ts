import { emptyProgress, MILESTONES, readProgress, type ProgressEvent, type Reach } from '../../server/services/progressRecord';

export type SubtaskProgress = { status: 'recorded'; event: ProgressEvent }
  | { status: 'unrecorded' } | { status: 'unreadable' };

/** Read only confirmed P4 records; legacy titles and AI proposals are not progress. */
export function readSubtaskProgress(value: unknown): SubtaskProgress {
  try {
    const event = readProgress(value).events.at(-1);
    return event ? { status: 'recorded', event } : { status: 'unrecorded' };
  } catch { return { status: 'unreadable' }; }
}

export function summarizeSubtaskProgress(entries: SubtaskProgress[]) {
  const milestones = Object.fromEntries(MILESTONES.map(key => [key,
    { achieved: 0, reconsider: 0, unnecessary: 0, unrecorded: 0 },
  ])) as Record<typeof MILESTONES[number], Record<Reach, number>>;
  let paused = 0;
  let unreadable = 0;
  for (const entry of entries) {
    if (entry.status === 'unreadable') { unreadable++; continue; }
    const input = entry.status === 'recorded' ? entry.event.input : emptyProgress();
    if (input.paused) paused++;
    for (const key of MILESTONES) milestones[key][input.milestones[key]]++;
  }
  return { total: entries.length, milestones, paused, unreadable };
}
