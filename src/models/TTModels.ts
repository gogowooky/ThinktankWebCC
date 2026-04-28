/**
 * TTModels.ts
 * v5 アプリ全体のモデルルート（シングルトン）
 *
 * データ階層: TTVault > Thoughts > Thought > Think
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

    this.Vault.LoadCache();
    this.LoadCache();
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
