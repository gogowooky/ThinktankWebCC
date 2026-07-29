/**
 * loadEnv.ts
 * server/.env を読み込む。index.ts の最初の import として読み込まれることを前提とする
 * （ESモジュールは依存を先に評価するため、apiAuth.ts 等の「モジュール読込時に
 * process.env を参照するコード」より必ず先に評価される必要がある）。
 *
 * 従来は `npm run server:dev` のインラインスクリプトのみが .env を読み込んでおり、
 * `npm start`（本番のエントリポイント）では一切読み込まれない不整合があった。
 * ここに統一することで開発/本番の起動経路によらず同じ設定読み込みになる。
 *
 * 注意: Cloud Run 等のコンテナ環境では server/.env 自体がデプロイに含まれないため、
 * この読み込みは効果を持たない（ファイルが存在しなければ dotenv は無音でスキップする）。
 * 公開環境では環境変数を `gcloud run deploy --set-env-vars` 等で直接設定すること。
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../server/.env') });
