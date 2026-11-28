/**
 * TTVaultProjects.ts
 * Project・Bundle に含まれる Think の解決（子 Project・対象の展開）と、Think の親 Project の記録の同期。
 * TTVault（TTVault.ts）の土台として継承して使う。子クラスから使うメンバーは protected にしている。
 */

import { TTThink } from './TTThink';
import { StorageManager } from '../services/storage/StorageManager';
import { PARENT_PROJECT_ID_KEY, parseProject, projectTargetIds, targetsAllThinks } from '../utils/thinkFormat';
import { createBundleResolutionState, finishBundleResolution } from './bundleResolution';
import { captureBundleResolutionSnapshot, matchesBundleResolutionSnapshot, matchesBundleContentBeforeLoad, acceptBundleContentLoad } from './bundleResolutionCache';
import type { BundleResolutionOptions } from './TTVaultStore';
import { TTVaultStore } from './TTVaultStore';

export abstract class TTVaultProjects extends TTVaultStore {
  /**
   * 指定 Project の対象に列挙された Think 群を非同期で返す。
   * Project ID が含まれる場合は、その Project の ID リストも再帰的に解決する。
   * 重複排除して TTThink[] を返す。
   */
  public async GetThinksForProjectAsync(bundleId: string, strict: boolean = false, options: BundleResolutionOptions = {}): Promise<TTThink[]> {
    const isProjectType = (ct?: string) => ct === 'project' || ct === 'bundle';
    const rootBundle = this.GetThink(bundleId);
    if (!rootBundle || !isProjectType(rootBundle.ContentType)) return [];

    const thinks = this.GetThinks();
    const allThinks = thinks.filter(t => !isProjectType(t.ContentType));
    const snapshot = captureBundleResolutionSnapshot(this.ID, this.IsLoaded, thinks);
    this._bundleInputsSnapshot = snapshot;
    const revision = this._bundleCacheRevision;
    const generation = (this._bundleRequestGenerations.get(bundleId) ?? 0) + 1;
    this._bundleRequestGenerations.set(bundleId, generation);
    const discardCurrentCache = () => {
      if (revision === this._bundleCacheRevision && generation === this._bundleRequestGenerations.get(bundleId)) {
        this._bundleThinksCache.delete(bundleId);
      }
    };
    let cacheable = true;
    const state = createBundleResolutionState();
    const activePath = new Set<string>();

    const collectParams = async (tid: string, visited: Set<string>): Promise<void> => {
      if (activePath.has(tid)) {
        options.onIssue?.({ code: 'cycle', thinkId: tid });
        return;
      }
      if (visited.has(tid)) return;
      visited.add(tid);
      activePath.add(tid);
      const think = this.GetThink(tid);
      if (!think || !isProjectType(think.ContentType)) return;
      if (think.IsMetaOnly) {
        const unchangedBeforeLoad = matchesBundleContentBeforeLoad(snapshot, think);
        await think.LoadContent();
        if (!unchangedBeforeLoad) cacheable = false;
        acceptBundleContentLoad(snapshot, think);
      }
      if (strict && think.IsMetaOnly) throw new Error('Bundle本文を読み込めませんでした');
      const parsed = parseProject(think.Content);
      options.onBundle?.(think);
      // # 対象 の1行目が「*」の Project は全ファイルを対象とする（Project 以外を全件）
      if (targetsAllThinks(think.Content)) allThinks.forEach(t => state.ids.add(t.ID));
      for (const id of parsed.ids) {
        if (isProjectType(this.GetThink(id)?.ContentType)) await collectParams(id, visited);
        else state.ids.add(id);
      }
      activePath.delete(tid);
    };

    try { await collectParams(bundleId, new Set()); }
    catch (error) { discardCurrentCache(); throw error; }
    const result = finishBundleResolution(state, allThinks);
    for (const id of result.missingIds) options.onIssue?.({ code: 'missing_think', thinkId: id });
    // 入力変更と後発要求の両方を照合し、待ち時間の長い旧結果が同期表示へ戻るのを防ぐ。
    if (cacheable && revision === this._bundleCacheRevision
      && generation === this._bundleRequestGenerations.get(bundleId)
      && matchesBundleResolutionSnapshot(snapshot, this.ID, this.IsLoaded, this.GetThinks())) {
      this._bundleThinksCache.set(bundleId, { ids: result.members.map(think => think.ID), snapshot });
      this._bundleInputsSnapshot = snapshot;
    }
    return result.members;
  }

  /**
   * 指定 Project の配下（本文で参照している Think と、その中の Project が参照している Think を何段でも）を返す。
   * GetThinksForProjectAsync と違い、途中の Project ファイル自身も含める（Think一覧で階層をたどれるように）。
   * 自分自身・循環・Vault に無い ID は除く。
   */
  public async GetProjectDescendantsAsync(projectId: string): Promise<TTThink[]> {
    const result = new Map<string, TTThink>();
    const visited = new Set<string>([projectId]);
    const queue = [projectId];
    while (queue.length > 0) {
      const project = this.GetThink(queue.shift()!);
      if (!project || project.ContentType !== 'project') continue;
      if (project.IsMetaOnly) await project.LoadContent();
      // # 対象 の1行目が「*」なら、Vault の全ファイル（Project 自身を除く）が配下
      if (targetsAllThinks(project.Content)) return this.GetThinks().filter(t => t.ID !== projectId);
      for (const id of parseProject(project.Content).ids) {
        if (visited.has(id)) continue;
        visited.add(id);
        const think = this.GetThink(id);
        if (!think) continue;
        result.set(id, think);
        if (think.ContentType === 'project') queue.push(id);
      }
    }
    return [...result.values()];
  }

  /**
   * Project 自身の # 対象 に直接記載された Think を返す。
   * 子 Project の # 対象は再帰展開しない。Seeds>Think一覧用。
   */
  public async GetProjectTargetsAsync(projectId: string): Promise<TTThink[]> {
    const project = this.GetThink(projectId);
    if (!project || project.ContentType !== 'project') return [];
    if (project.IsMetaOnly) await project.LoadContent();
    if (project.IsMetaOnly) return [];
    if (targetsAllThinks(project.Content)) return this.GetThinks().filter(t => t.ID !== projectId);

    const result: TTThink[] = [];
    const seen = new Set<string>();
    for (const id of projectTargetIds(project.Content)) {
      if (id === projectId || seen.has(id)) continue;
      seen.add(id);
      const think = this.GetThink(id);
      if (think) result.push(think);
    }
    return result;
  }

  /** @deprecated Use GetThinksForProjectAsync */
  public GetThinksForBundleAsync(bundleId: string, strict: boolean = false, options: BundleResolutionOptions = {}): Promise<TTThink[]> {
    return this.GetThinksForProjectAsync(bundleId, strict, options);
  }

  /** GetThinksForProjectAsync の同期版（未読本文のロードはスキップ）*/
  public GetThinksForProject(bundleId: string): TTThink[] {
    const isProjectType = (ct?: string) => ct === 'project' || ct === 'bundle';
    const thinks = this.GetThinks();
    const allThinks = thinks.filter(t => !isProjectType(t.ContentType));
    const cached = this._bundleThinksCache.get(bundleId);
    if (cached && matchesBundleResolutionSnapshot(cached.snapshot, this.ID, this.IsLoaded, thinks)) {
      const byId = new Map(allThinks.map(think => [think.ID, think]));
      return cached.ids.map(id => byId.get(id)).filter((think): think is TTThink => think !== undefined);
    }
    this._bundleThinksCache.delete(bundleId);
    const rootBundle = this.GetThink(bundleId);
    if (!rootBundle || !isProjectType(rootBundle.ContentType) || rootBundle.IsMetaOnly) return [];

    const state = createBundleResolutionState();
    const collectParams = (tid: string, visited: Set<string>): void => {
      if (visited.has(tid)) return;
      visited.add(tid);
      const think = this.GetThink(tid);
      if (!think || !isProjectType(think.ContentType) || think.IsMetaOnly) return;
      const parsed = parseProject(think.Content);
      for (const id of parsed.ids) {
        if (isProjectType(this.GetThink(id)?.ContentType)) collectParams(id, visited);
        else state.ids.add(id);
      }
    };
    collectParams(bundleId, new Set());
    return finishBundleResolution(state, allThinks).members;
  }

  /** @deprecated Use GetThinksForProject */
  public GetThinksForBundle(bundleId: string): TTThink[] {
    return this.GetThinksForProject(bundleId);
  }

  // ── 親 project の記録（metadata.parentProjectid）──────────────────────

  /**
   * projectファイルの構成が変わったとき、子の Think の metadata.parentProjectid を合わせる。
   * - 参照している Think のうち、親の記録が無い（または記録先の project がもう無い）ものに、このプロジェクトの ID を記録する。
   *   既に別の親が記録されていれば置き換えない（最初に組み込んだ project を親として保つ）
   * - 参照が外れた Think は、記録がこのプロジェクトのときだけ消す（beforeIds が null＝保存前の構成が分からないときは消さない）
   * project 本体の保存とは独立させ、失敗しても保存は失敗にしない。
   * 編集中の自動保存（TTThink）からは待たずに走らせ、入力中の保存を遅らせない。
   */
  public OnProjectMembersSaved(projectId: string, beforeIds: string[] | null, afterIds: string[]): void {
    void this.SyncParentProjectIds(projectId, beforeIds, afterIds);
  }

  public async SyncParentProjectIds(projectId: string, beforeIds: string[] | null, afterIds: string[]): Promise<void> {
    const after = new Set(afterIds.filter(id => id !== projectId));
    const writes: Promise<void>[] = [];
    for (const id of after) {
      if (!this._hasLiveParentProject(id)) writes.push(this._writeParentProjectId(id, projectId));
    }
    for (const id of beforeIds ?? []) {
      if (!after.has(id) && this._parentProjectIdOf(id) === projectId) writes.push(this._writeParentProjectId(id, undefined));
    }
    await this._settleParentWrites(writes);
  }

  /** 記録先の project が Vault から消えていれば、親は無いものとして新しい親を受け入れる */
  private _hasLiveParentProject(id: string): boolean {
    const parentId = this._parentProjectIdOf(id);
    return !!parentId && this.GetThink(parentId)?.ContentType === 'project';
  }

  protected _parentProjectIdOf(id: string): string | undefined {
    const value: unknown = this.GetThink(id)?.Metadata?.[PARENT_PROJECT_ID_KEY];
    return typeof value === 'string' && value ? value : undefined;
  }

  protected async _writeParentProjectId(id: string, projectId: string | undefined): Promise<void> {
    const think = this.GetThink(id);
    if (!think || this._parentProjectIdOf(id) === projectId) return;
    if (think.IsMetaOnly) {
      // 本文未取得のまま Think 全体を保存すると本文を失うので、metadata だけを書き換える
      const saved = await StorageManager.instance.updateMetadata(id, { [PARENT_PROJECT_ID_KEY]: projectId }, think.UpdatedAt || undefined);
      think.Metadata = saved.metadata ?? {};
      think.markMetadataSaved();
      if (saved.updatedAt) think.UpdatedAt = saved.updatedAt;
      return;
    }
    // 開いている Think は保存の順番待ちに乗せ、編集中の保存と楽観ロックで衝突しないようにする
    const next = { ...think.Metadata };
    if (projectId) next[PARENT_PROJECT_ID_KEY] = projectId;
    else delete next[PARENT_PROJECT_ID_KEY];
    think.Metadata = next;
    await think.SaveContent();
  }

  protected async _settleParentWrites(writes: Promise<void>[]): Promise<void> {
    const results = await Promise.allSettled(writes);
    for (const r of results) {
      if (r.status === 'rejected') console.warn('[TTVault] parentProjectid の記録に失敗しました:', r.reason);
    }
  }
}
