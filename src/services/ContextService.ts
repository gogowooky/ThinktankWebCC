import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { StorageManager } from './storage/StorageManager';
import type { ThinkMeta } from './storage/IStorageBackend';
import type { ContextIssue, ContextIssueCode, ContextSnapshot, ContextSource } from './contextTypes';
import { appendLegacyContext, emptyContextState } from './legacyContextAdapter';
import { readThinkSupport } from '../../server/services/thinkSupportRecord';
import { captureSubtaskContext, captureProgressContext } from './subtaskContext';

export interface ContextReader {
  getBody(id: string): Promise<string | null>;
  /** complete must be explicitly guaranteed by the backend, including pagination. */
  search(query: string): Promise<{ items: ThinkMeta[]; complete: boolean }>;
}

export class ContextReadError extends Error {
  constructor(public readonly code: 'vault_not_loaded' | 'invalid_bundle' | 'bundle_unavailable' | 'context_changed' | 'context_too_large', message: string) {
    super(message); this.name = 'ContextReadError';
  }
}

const defaultReader: ContextReader = {
  getBody: id => StorageManager.instance.getBody(id),
  // Current storage contract supplies no completeness information; BQ caps at 200.
  search: async query => ({ items: await StorageManager.instance.search(query), complete: false }),
};

function signature(vault: TTVault): string {
  return JSON.stringify([vault.ID, vault.IsLoaded, vault.GetThinks().map(t => [
    t.ID, t.VaultID, t.Name, t.ContentType, t.Content, t.Keywords, t.UpdatedAt,
    t.IsMetaOnly, t.IsDirty, t.IsMetadataDirty, t.Metadata,
  ])]);
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Context request cancelled', 'AbortError');
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

async function hash(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

const messages: Record<ContextIssueCode, string> = {
  cycle: 'Bundleの循環参照があります。',
  missing_think: '対象Thinkが読込済みのVault一覧にありません。',
  implicit_all_blocked: '対象指定がないため、全Vaultへの暗黙の拡張を停止しました。',
  conflicting_conditions: '複数Bundleの検索条件が競合するため、資料範囲を確定できません。',
  search_incomplete: '検索結果の完全性を確認できません。件数上限などで資料が欠けている可能性があります。',
  load_failed: '資料の本文を読み込めませんでした。',
  remote_version_unverified: '本文取得APIは版を返さないため、保存側の本文とメタデータの版の一致は未検証です。',
  decision_conflict: '異なる決定記録があります。出典ごとに並記し、採用判断は行っていません。',
  invalid_support_record: '思考支援メタデータに未対応または不正な値があります。',
};

/**
 * Read-only P1 facade. Resolves a private copy of the Vault using the existing
 * Bundle rules, so content loads/cache writes cannot change live models or storage.
 * Never saves, runs AI, follows thoughtSupport.references outside membership,
 * or persists a Snapshot. Missing information is returned as explicit issues.
 */
export class ContextService {
  constructor(private readonly vault: TTVault, private readonly reader: ContextReader = defaultReader) {}

  async getBundleContext(bundleId: string, options: { signal?: AbortSignal; maxSources?: number; includeSubtasks?: boolean } = {}): Promise<ContextSnapshot> {
    const { signal } = options;
    assertNotAborted(signal);
    if (!this.vault.IsLoaded) throw new ContextReadError('vault_not_loaded', 'Vault一覧の読み込み完了後に再試行してください。');
    if (this.vault.GetThink(bundleId)?.ContentType !== 'bundle') {
      throw new ContextReadError('invalid_bundle', '指定されたBundleがありません。');
    }
    const startedAt = new Date().toISOString();
    const initial = signature(this.vault);
    const subtasks = options.includeSubtasks ? captureSubtaskContext(this.vault, bundleId) : undefined;
    const bundleProgress = options.includeSubtasks ? captureProgressContext(this.vault.GetThink(bundleId)!) : undefined;
    const copy = new TTVault(this.vault.ID); copy.IsLoaded = true;
    const issues: ContextIssue[] = [];
    const issue = (code: ContextIssueCode, thinkId: string) => {
      if (!issues.some(i => i.code === code && i.thinkId === thinkId)) issues.push({ code, thinkId, message: messages[code] });
    };
    const origins = new Map<string, ContextSource['origin']>();
    const dirty = new Map<string, boolean>();
    for (const original of this.vault.GetThinks()) {
      const item = new TTThink();
      item.ID = original.ID; item.VaultID = original.VaultID;
      item.ContentType = original.ContentType; item.setContentSilent(original.Content);
      item.Name = original.Name; item.Keywords = original.Keywords;
      item.UpdatedAt = original.UpdatedAt; item.IsMetaOnly = original.IsMetaOnly;
      item.Metadata = structuredClone(original.Metadata);
      dirty.set(item.ID, original.IsDirty || original.IsMetadataDirty);
      origins.set(item.ID, original.IsMetaOnly ? 'storage-body' : 'loaded-memory');
      // Isolate the read and distinguish 404/null from a legitimate empty body.
      item.LoadContent = async () => {
        assertNotAborted(signal);
        if (!item.IsMetaOnly) return;
        let body: string | null;
        try { body = await this.reader.getBody(item.ID); }
        catch (error) { issue('load_failed', item.ID); throw error; }
        assertNotAborted(signal);
        if (body === null) { issue('load_failed', item.ID); throw new Error('Missing content'); }
        const title = item.Content ? item.Content.split('\n')[0] : `# ${item.Name}`;
        item.setContentSilent(`${title}\n${body}`); item.IsMetaOnly = false;
        issue('remote_version_unverified', item.ID);
      };
      copy.AddItem(item);
    }
    const root = copy.GetThink(bundleId)!;
    try { await root.LoadContent(); }
    catch (error) {
      assertNotAborted(signal);
      throw new ContextReadError('bundle_unavailable', 'Bundle本文を取得できません。資料範囲は解決していません。');
    }
    const definitions = new Map<string, TTThink>([[root.ID, root]]);
    let members: TTThink[] = [];
    try {
      members = await copy.GetThinksForBundleAsync(bundleId, true, {
        allowImplicitAll: false,
        onBundle: bundle => definitions.set(bundle.ID, bundle),
        onIssue: entry => issue(entry.code, entry.thinkId),
        search: async query => {
          assertNotAborted(signal);
          const result = await this.reader.search(query);
          assertNotAborted(signal);
          if (!result.complete) issue('search_incomplete', bundleId);
          // Deleted entries must never be added to context membership.
          return result.items.filter(meta => !meta.isDeleted);
        },
      });
    } catch {
      assertNotAborted(signal);
      issue('load_failed', bundleId);
      // Resolution failed: don't use partial membership or a stale cache.
    }
    if (issues.some(i => i.code === 'cycle' || i.code === 'conflicting_conditions')) members = [];
    if (options.maxSources !== undefined && members.length > options.maxSources) {
      throw new ContextReadError('context_too_large', `参照資料が${members.length}件あります。${options.maxSources}件以内のBundleに絞ってください。Thinktankでは資料を使わずに相談することもできます。`);
    }

    const toSource = async (think: TTThink): Promise<ContextSource> => ({
      thinkId: think.ID, title: think.Name, contentType: think.ContentType, content: think.Content,
      contentHash: await hash(think.Content), hashAlgorithm: 'SHA-256', normalizationVersion: 'exact-utf8-v1',
      observedUpdatedAt: think.UpdatedAt, origin: origins.get(think.ID)!, hasUnsavedChanges: dirty.get(think.ID)!,
    });
    const bundleDefinitions = await Promise.all([...definitions.values()].map(toSource));
    const sources: ContextSource[] = [];
    for (const member of members) {
      assertNotAborted(signal);
      try { await member.LoadContent(); }
      catch { assertNotAborted(signal); issue('load_failed', member.ID); continue; }
      sources.push(await toSource(member));
    }
    const state = emptyContextState();
    let manualState = null;
    try { manualState = readThinkSupport(root.Metadata.thinkSupport); }
    catch { issue('invalid_support_record', bundleId); }
    for (const source of [...bundleDefinitions, ...sources]) {
      appendLegacyContext(state, source, copy.GetThink(source.thinkId)!.Metadata, issues);
    }
    // Divergence is a candidate conflict, not a semantic contradiction detector.
    if (new Set(state.decisions.map(s => s.value.trim())).size > 1) issue('decision_conflict', bundleId);
    assertNotAborted(signal);
    if (initial !== signature(this.vault)) {
      throw new ContextReadError('context_changed', '読取中にVaultが更新されました。新しい状態で再試行してください。');
    }
    return freeze({
      schemaVersion: 1, snapshotId: crypto.randomUUID(), vaultId: copy.ID, bundleId,
      startedAt, capturedAt: new Date().toISOString(), scope: 'bundle-only', consistency: 'captured-client-state',
      quality: issues.length ? 'partial' : 'complete', bundle: bundleDefinitions[0], bundleDefinitions,
      resolvedThinkIds: [...new Set([...members.map(t => t.ID), ...issues.filter(i => i.code === 'missing_think').map(i => i.thinkId)])],
      sources, state, manualState, issues, ...(subtasks ? { subtasks, bundleProgress } : {}),
    });
  }
}

/** One instance per UI consumer. Superseded results can never be published as the current Bundle. */
export class LatestBundleContextReader {
  private controller?: AbortController;
  constructor(private readonly service: ContextService) {}
  cancel(): void { this.controller?.abort(); }
  async read(bundleId: string): Promise<ContextSnapshot> {
    this.cancel();
    const controller = new AbortController(); this.controller = controller;
    const snapshot = await this.service.getBundleContext(bundleId, { signal: controller.signal });
    assertNotAborted(controller.signal);
    return snapshot;
  }
}
