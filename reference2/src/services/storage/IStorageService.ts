/**
 * IStorageService.ts
 * ストレージサービスのインターフェース定義
 * 
 * 将来の拡張:
 * - LocalStorageService: ブラウザのlocalStorageを使用
 * - ApiStorageService: サーバーAPI経由でファイルシステムにアクセス
 * - DriveStorageService: Google Drive API経由でクラウドにアクセス
 */

/**
 * ストレージ操作の結果
 */
export interface StorageResult<T = void> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * ストレージサービスのインターフェース
 */
export interface IStorageService {
    /**
     * サービス名（デバッグ/ログ用）
     */
    readonly name: string;

    /**
     * ファイルを保存
     * @param path ファイルパス（相対パス）
     * @param content ファイル内容
     */
    save(path: string, content: string): Promise<StorageResult>;

    /**
     * ファイルを読み込み
     * @param path ファイルパス（相対パス）
     * @returns ファイル内容、見つからない場合は null
     */
    load(path: string): Promise<StorageResult<string | null>>;

    /**
     * ファイルが存在するか確認
     * @param path ファイルパス（相対パス）
     */
    exists(path: string): Promise<StorageResult<boolean>>;

    /**
     * ファイル一覧を取得
     * @param directory ディレクトリパス（相対パス）
     * @param pattern ファイルパターン（オプション、例: "*.md"）
     */
    list(directory: string, pattern?: string): Promise<StorageResult<string[]>>;

    /**
     * ファイルを削除
     * @param path ファイルパス（相対パス）
     */
    delete(path: string): Promise<StorageResult>;
}

/**
 * ストレージタイプの定義
 */
export type StorageType = 'bigquery' | 'local';

/**
 * ストレージマネージャーのインターフェース
 * 複数のストレージサービスを管理
 */
export interface IStorageManager {
    /**
     * 指定されたタイプのストレージサービスを取得
     */
    getStorage(type: StorageType): IStorageService;

    /**
     * キャッシュストレージを取得
     */
    readonly cache: IStorageService;


}
