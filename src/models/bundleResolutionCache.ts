import type { TTThink } from './TTThink';

function metadataText(think: TTThink): string | undefined {
  try { return JSON.stringify(think.Metadata); }
  catch { return undefined; }
}

function dateWindow(): string {
  const now = new Date();
  return `${now.toISOString().slice(0, 10)}|${now.getFullYear()}-${now.getMonth()}-${now.getDate()}|${now.getTimezoneOffset()}`;
}

function captureThink(think: TTThink) {
  return {
    think, id: think.ID, vaultId: think.VaultID, contentType: think.ContentType,
    content: think.Content, name: think.Name, keywords: think.Keywords, relatedIds: think.RelatedIDs,
    updatedAt: think.UpdatedAt, updateDate: think.UpdateDate, metaOnly: think.IsMetaOnly,
    metadata: metadataText(think),
  };
}

export function captureBundleResolutionSnapshot(vaultId: string, loaded: boolean, thinks: readonly TTThink[]) {
  return { vaultId, loaded, dateWindow: dateWindow(), items: thinks.map(captureThink) };
}

export type BundleResolutionSnapshot = ReturnType<typeof captureBundleResolutionSnapshot>;

function matchesThink(before: ReturnType<typeof captureThink>, think: TTThink): boolean {
  return before.think === think && before.id === think.ID && before.vaultId === think.VaultID
    && before.contentType === think.ContentType && before.content === think.Content && before.name === think.Name
    && before.keywords === think.Keywords && before.relatedIds === think.RelatedIDs && before.updatedAt === think.UpdatedAt
    && before.updateDate === think.UpdateDate && before.metaOnly === think.IsMetaOnly
    && before.metadata !== undefined && before.metadata === metadataText(think);
}

export function matchesBundleResolutionSnapshot(
  snapshot: BundleResolutionSnapshot, vaultId: string, loaded: boolean, thinks: readonly TTThink[],
): boolean {
  if (snapshot.vaultId !== vaultId || snapshot.loaded !== loaded || snapshot.dateWindow !== dateWindow()
    || snapshot.items.length !== thinks.length) return false;
  return snapshot.items.every((before, index) => matchesThink(before, thinks[index]));
}

export function matchesBundleContentBeforeLoad(snapshot: BundleResolutionSnapshot, think: TTThink): boolean {
  const before = snapshot.items.find(item => item.think === think);
  return before !== undefined && matchesThink(before, think);
}

export function acceptBundleContentLoad(snapshot: BundleResolutionSnapshot, think: TTThink): void {
  const before = snapshot.items.find(item => item.think === think);
  if (!before) return;
  // 本文ロードだけは解決自身の更新として認め、他のフィールドの外部変更は照合に残す。
  before.content = think.Content;
  before.name = think.Name;
  before.metaOnly = think.IsMetaOnly;
}
