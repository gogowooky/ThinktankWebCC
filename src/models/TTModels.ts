/**
 * TTModels.ts
 * v5 アプリ全体のモデルルート（シングルトン）
 *
 * データ階層: TTVault > Bundles > Bundle > Think
 * Phase 1-3: TTVault を中心とした基本構成
 * Phase 4 以降: TTApplication から参照される
 */

import { TTCollection } from './TTCollection';
import { TTVault } from './TTVault';

export class TTModels extends TTCollection {
  /** メインの保管庫（BigQuery: thinktank.vault / LocalFS: ./../ThinktankLocal/vault）*/
  public Vault: TTVault;

  private static _instance: TTModels | null = null;

  public override get ClassName(): string {
    return 'TTModels';
  }

  private constructor() {
    super();
    this.ID = 'Thinktank';
    this.Name = 'Thinktank';
    this.Description = 'Root Model v5';

    this.Vault = new TTVault('vault');
    this.AddItem(this.Vault);

    // 失敗は握り潰され（LoadCache 内で 3 回リトライ + ログ）、通知されない設計。
    // 呼び出し側は結果を待たない。
    void this.Vault.LoadCache();
    void this.LoadCache();
  }

  public static get Instance(): TTModels {
    if (!TTModels._instance) {
      TTModels._instance = new TTModels();
    }
    return TTModels._instance;
  }

  public static resetInstance(): void {
    TTModels._instance = null;
  }

  public override async LoadCache(): Promise<void> {
    this.IsLoaded = true;
  }
}
