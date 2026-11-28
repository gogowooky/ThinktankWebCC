/**
 * TTVaultStore.ts
 * TTVault の土台。Think の一覧の読み込み（前回の一覧の先出し・全件取得での更新）、Think の取得、ID の生成。
 * Project・Bundle の解決結果の cache もここに持つ（中身を変えたら捨てる）。
 * TTVault（TTVault.ts）の土台として継承して使う。子クラスから使うメンバーは protected にしている。
 */

import { TTCollection } from './TTCollection';
import { TTThink } from './TTThink';
import type { ThinkMeta } from '../services/storage/IStorageBackend';
import { StorageManager } from '../services/storage/StorageManager';
import { perfMark } from '../utils/perfLog';
import { isFirebaseSignInRequiredError } from '../platform/web/FirebaseAuthService';
import { matchesBundleResolutionSnapshot, type BundleResolutionSnapshot } from './bundleResolutionCache';

/** Optional diagnostics for isolated, read-only context resolution. Existing UI defaults are preserved. */
export interface BundleResolutionOptions {
  onBundle?: (bundle: TTThink) => void;
  onIssue?: (issue: { code: 'cycle' | 'missing_think'; thinkId: string }) => void;
}

/** 一覧を読めなかった理由。signin は未ログイン（新しいPC・ブラウザの初期状態）。 */
export interface VaultLoadError {
  kind: 'signin' | 'error';
  message: string;
}
export abstract class TTVaultStore extends TTCollection {
  /** Firestore上のVault ID（PC版ではMarkdownバックアップのディレクトリ名にも使う）*/
  public VaultName: string = 'vault_ver2';

  /** 直近の LoadCache が失敗した理由。空の一覧と「読めなかった」を画面で区別するために保持する。 */
  public LoadError: VaultLoadError | null = null;

  /** 件数が同じでも一覧の中身が入れ替わったことを描画側へ伝える */
  public ListRevision: number = 0;

  /** GetThinksForBundleAsync の結果をキャッシュする（同期版 GetThinksForBundle 用）*/
  protected _bundleThinksCache = new Map<string, { ids: string[]; snapshot: BundleResolutionSnapshot }>();

  protected _bundleCacheRevision = 0;

  protected _bundleRequestGenerations = new Map<string, number>();

  protected _bundleInputsSnapshot: BundleResolutionSnapshot | null = null;

  protected _subtaskCreations = new Map<string, { promise: Promise<TTThink>; isCurrent: () => boolean }>();

  public override get ClassName(): string {
    return 'TTVault';
  }

  constructor(vaultName: string = 'vault_ver2') {
    super();
    this.ID = vaultName;
    this.VaultName = vaultName;
    this.Name = vaultName;
  }

  private _invalidateBundleResults(): void {
    this._bundleCacheRevision++;
    this._bundleThinksCache.clear();
    this._bundleRequestGenerations.clear();
    this._bundleInputsSnapshot = null;
  }

  public override NotifyUpdated(updateProperty: boolean = true): void {
    // Seeds は解決結果の表示通知にもこのAPIを使うため、入力が同じ通知ではcacheを保つ。
    if (this._bundleInputsSnapshot
      && !matchesBundleResolutionSnapshot(this._bundleInputsSnapshot, this.ID, this.IsLoaded, this.GetThinks())) {
      this._invalidateBundleResults();
    }
    super.NotifyUpdated(updateProperty);
  }

  public override NotifyRefresh(): void {
    this._invalidateBundleResults();
    super.NotifyRefresh();
  }

  protected override InvalidateItemsCache(): void {
    this._invalidateBundleResults();
    super.InvalidateItemsCache();
  }

  protected override ClearItemsSilent(): void {
    this._invalidateBundleResults();
    super.ClearItemsSilent();
  }

  // ── 型付きアクセス ─────────────────────────────────────────────────

  /** 全 TTThink を型付きで取得する */
  public GetThinks(): TTThink[] {
    return this.GetItems().filter((item): item is TTThink => item instanceof TTThink);
  }

  /**
   * Projects を取得する（ContentType='project' の TTThink 一覧）
   */
  public GetProjects(): TTThink[] {
    return this.GetThinks().filter(t => t.ContentType === 'project' || (t.ContentType as string) === 'bundle');
  }

  /** @deprecated Use GetProjects */
  public GetBundles(): TTThink[] {
    return this.GetProjects();
  }

  /** ID で TTThink を取得する（型付き）*/
  public GetThink(id: string): TTThink | undefined {
    const item = this.GetItem(id);
    return item instanceof TTThink ? item : undefined;
  }

  /** 他の端末やAIが新しく作り、まだ一覧に載っていない参照先も、IDから1件だけ読み込む。 */
  public async GetOrLoadThink(id: string): Promise<TTThink | undefined> {
    const loaded = this.GetThink(id);
    if (loaded) return loaded;
    const record = await StorageManager.instance.getRecord(id);
    // 読み込み中に同期で届いた Think（編集中の場合もある）を優先する。
    const synced = this.GetThink(id);
    if (synced) return synced;
    if (!record || record.meta.isDeleted || record.meta.thinkid !== id) return undefined;
    const think = this._addThinkFromMeta(record.meta);
    think.setContentSilent(record.meta.title + '\n' + record.body);
    think.markSaved();
    think.IsMetaOnly = false;
    this.Count = this._children.size;
    this.NotifyUpdated(false);
    return think;
  }

  /** TTThink を追加する（VaultID を自動設定）*/
  public AddThink(think: TTThink): TTThink {
    think.VaultID = this.ID;
    return this.AddItem(think) as TTThink;
  }

  // ── ストレージ連携────────────────────────────────────────

  /**
   * 常駐エージェントを使うモードでは、シェル起動直後にAPIサーバーがまだ
   * listenを開始していないタイミングでこの呼び出しが競合することがある
   * （シェル側にreadiness gateが無いため）。一過性の接続失敗を「ロード済みだが
   * 空」として確定させてしまわないよう、短い間隔でリトライしてから諦める。
   */
  public override async LoadCache(useCachedList: boolean = false): Promise<void> {
    const cachedIds = useCachedList ? await this._showCachedList() : null;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const metas = await StorageManager.instance.listMeta();
        if (cachedIds) {
          await this._applyFreshList(metas, cachedIds);
        } else {
          for (const meta of metas) this._addThinkFromMeta(meta);
        }
        this.Count    = this._children.size;
        this.IsLoaded = true;
        this.LoadError = null;
        this.NotifyRefresh();
        perfMark(`vault-loaded(${this.Count})`);
        console.log(`[TTVault] LoadCache: ${this.Count} items loaded (vault=${this.ID})`);
        return;
      } catch (e) {
        if (isFirebaseSignInRequiredError(e)) {
          // 未ログインは待っても解消しないので再試行せず、ログイン案内を出す。
          console.warn(`[TTVault] LoadCache: Firebase 未ログインのため一覧を読み込めません (vault=${this.ID})`);
          this.setLoadError({ kind: 'signin', message: e.message });
          return;
        }
        console.error(`[TTVault] LoadCache failed (attempt ${attempt}/${maxAttempts}):`, e);
        if (attempt === maxAttempts) {
          this.setLoadError({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
        }
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
        // 最終試行も失敗した場合は IsLoaded を true にせず false のまま残す。
        // ReloadAll() 等による再試行が「ロード済みだが空」に阻まれないようにするため。
      }
    }
  }

  private _addThinkFromMeta(meta: ThinkMeta): TTThink {
    const think = new TTThink();
    think.ID          = meta.thinkid;
    think.VaultID     = this.ID;
    think.ContentType = TTThink.contentTypeOf(meta.category);
    think.Keywords    = meta.keywords  ?? '';
    think.RelatedIDs  = meta.relatedIds ?? '';
    // metadata が万一オブジェクト以外（文字列化されたYAML等）で届いた場合、
    // そのまま代入すると think.Metadata.xxx = ... の代入時に
    // "Cannot create property on string" で描画がクラッシュする。
    if (meta.metadata != null && typeof meta.metadata !== 'object') {
      console.error(`[TTVault] LoadCache: metadata is not an object for ${meta.thinkid}, resetting to {}`, meta.metadata);
    }
    think.Metadata    = (meta.metadata && typeof meta.metadata === 'object') ? meta.metadata : {};
    think.markMetadataSaved();
    think.IsMetaOnly  = true;
    think.UpdatedAt   = meta.updatedAt ?? '';
    think.setContentSilent(meta.title);
    think.markSaved();
    think._parent = this;
    this._children.set(think.ID, think);
    return think;
  }

  /**
   * 前回の一覧を先に出す。通信を待たずに画面を使い始められるが、中身は古い可能性がある。
   * @returns 表示した ID（一覧を出せなければ null）
   */
  private async _showCachedList(): Promise<Set<string> | null> {
    let metas: ThinkMeta[] | null = null;
    try {
      metas = await StorageManager.instance.listMetaCached();
    } catch (e) {
      console.warn('[TTVault] 前回の一覧を読めませんでした', e);
    }
    if (!metas || metas.length === 0) return null;
    for (const meta of metas) this._addThinkFromMeta(meta);
    this.Count    = this._children.size;
    this.IsLoaded = true;
    this.NotifyRefresh();
    perfMark(`vault-cached(${this.Count})`);
    return new Set(metas.map(meta => meta.thinkid));
  }

  /**
   * キャッシュで出した一覧を正本へ揃える。編集中の Think には触らず、手元より古い情報でも戻さない。
   * 表示後に作られた Think は取得済みの一覧に無いことがあるので、消すのはキャッシュ由来のものだけ。
   */
  private async _applyFreshList(metas: ThinkMeta[], cachedIds: Set<string>): Promise<void> {
    const freshIds = new Set(metas.map(meta => meta.thinkid));
    let changed = false;
    for (const meta of metas) {
      const think = this.GetThink(meta.thinkid);
      if (!think) {
        this._addThinkFromMeta(meta);
        changed = true;
      } else if (think.ApplyNewerMeta(meta)) {
        changed = true;
      }
    }
    for (const id of cachedIds) {
      const think = this.GetThink(id);
      if (!think || freshIds.has(id) || think.IsDirty || think.IsMetadataDirty) continue;
      think._parent = null;
      this._children.delete(id);
      changed = true;
    }
    if (changed) {
      this.ListRevision++;
      this.InvalidateItemsCache();
    }
  }

  private setLoadError(error: VaultLoadError): void {
    this.LoadError = error;
    this.NotifyRefresh();
  }

  /** 全データをストレージから再ロードしリスナーを発火する（表示更新用）*/
  public async ReloadAll(): Promise<void> {
    this.ClearItemsSilent();
    this.IsLoaded = false;
    await this.LoadCache();
  }

  // ── ID 生成 ────────────────────────────────────────────────────────

  /** ファイルID を生成する（yyyy-MM-dd-hhmmss 形式）*/
  public static generateId(date: Date = new Date()): string {
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  /** 衝突を避けた ID 生成（同秒衝突時は1秒遡る）*/
  public static generateUniqueId(
    existingIds: Set<string>,
    date: Date = new Date(),
    maxRetries = 60
  ): string {
    let current = new Date(date);
    for (let i = 0; i < maxRetries; i++) {
      const id = TTVaultStore.generateId(current);
      if (!existingIds.has(id)) return id;
      current = new Date(current.getTime() - 1000);
    }
    return `${TTVaultStore.generateId(date)}-${Math.random().toString(36).slice(2, 6)}`;
  }
}
