# Cloud Run デプロイ手順

`server/.env` はコンテナに含まれない（`.gitignore` / `.dockerignore` で除外）。
公開環境では認証情報を以下の系統で供給する。

| 用途 | 供給方法 |
| --- | --- |
| BigQuery | ADC（Cloud Run のランタイムサービスアカウント）。鍵ファイル不要 |
| Drive / AI APIキー | Secret Manager |
| アクセス制御 | IAP（Cloud Run 直接統合。ロードバランサ不要） |

## 前提

- プロジェクト: `thinktankweb-483408`（プロジェクト番号 `699735546730`）
- ランタイムサービスアカウント: `699735546730-compute@developer.gserviceaccount.com`

これは Compute Engine デフォルトSAであり、ローカルの鍵JSON
（`thinktankweb-483408-9548b5a08345.json`）と**同一の主体**である。
したがって ADC に切り替えても BigQuery の権限も Drive の `Thinktank`
フォルダの所有者も変わらない。

## 0. gcloud CLI の更新（初回必須）

`--iap` フラグと `--resource-type=cloud-run` は新しい CLI にしか無い。
SDK 550.0.0 / core 2025.12.12 では未対応であることを確認済み。
**対話モードのターミナルで**実行すること（非対話では更新できない）。

```bash
gcloud components update
```

更新後、以下で `cloud-run` が選択肢に出ることを確認してから先に進む。

```bash
gcloud iap web add-iam-policy-binding --help
```

出てこない場合は `gcloud components install beta` を入れ、以降の
`gcloud run deploy` を `gcloud beta run deploy` に読み替える。

## 1. Secret Manager にシークレットを登録

```bash
gcloud services enable secretmanager.googleapis.com --project=thinktankweb-483408
```

AI の APIキーを登録する（値の入力を促されるので貼り付けて Ctrl+Z → Enter）。

```bash
gcloud secrets create ANTHROPIC_API_KEY --replication-policy=automatic --data-file=- --project=thinktankweb-483408
```

Gemini も使う場合は同様に `GEMINI_API_KEY` を作成する。

Drive を使う場合のみ、鍵JSONを丸ごと登録する。
Drive は ADC では動かない（Cloud Run のメタデータサーバーが発行するトークンは
`cloud-platform` スコープであり、Workspace API である Drive のスコープを
含まないため）。

```bash
gcloud secrets create GOOGLE_SERVICE_ACCOUNT_KEY --replication-policy=automatic --data-file=thinktankweb-483408-9548b5a08345.json --project=thinktankweb-483408
```

## 2. ランタイムSAにシークレット読み取り権限を付与

```bash
gcloud projects add-iam-policy-binding thinktankweb-483408 --member=serviceAccount:699735546730-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

## 3. IAP を準備

```bash
gcloud services enable iap.googleapis.com --project=thinktankweb-483408
```

IAP サービスエージェントを作成する。

```bash
gcloud beta services identity create --service=iap.googleapis.com --project=thinktankweb-483408
```

OAuth 同意画面が未設定なら、ここで設定を求められる（個人利用なので
User Type は「内部」でよい）。

## 4. デプロイ

```bash
npm run deploy
```

`--no-allow-unauthenticated --iap` が付くため、この時点で公開URLは保護される。

`GOOGLE_SERVICE_ACCOUNT_KEY` を使わない場合は `package.json` の `deploy` から
その指定を外す。BigQuery は ADC で動作する。

## 5. IAP にアクセス権を付与

IAP サービスエージェントが Cloud Run を呼び出せるようにする。

```bash
gcloud run services add-iam-policy-binding ttweb --region=asia-northeast1 --member=serviceAccount:service-699735546730@gcp-sa-iap.iam.gserviceaccount.com --role=roles/run.invoker
```

自分のアカウントにアクセスを許可する。

```bash
gcloud iap web add-iam-policy-binding --member=user:gogowooky@gmail.com --role=roles/iap.httpsResourceAccessor --region=asia-northeast1 --resource-type=cloud-run --service=ttweb
```

これで公開URLをブラウザで開くと Google のログイン画面が出て、
許可したアカウントだけが通過する。

## 6. 起動確認と JWT 検証の有効化

```bash
gcloud run services logs read ttweb --region=asia-northeast1 --limit=50
```

正常時は以下が出力される。`auth:` がどちらの経路で認証したかを示す。

```
[Server] Listening on http://localhost:8080
[BigQueryService] Initialized (project: thinktankweb-483408, table: thinktank.vault, auth: ADC)
[Server] BigQuery initialized
```

`server/middleware/apiAuth.ts` は起動後の最初のリクエストで一度だけ、
IAP の署名付きJWT（`x-goog-iap-jwt-assertion`）が実際に届いたかをログに出す。

- 届いた場合: `[apiAuth] IAP JWT 検証成功 (aud: ..., email: ...)`
- 届かない場合: `[apiAuth] x-goog-iap-jwt-assertion が見つかりません。受信した x-goog-* ヘッダー: ...`

**届いた場合のみ**、ログに出た `aud` の値を固定して検証を必須化する。
これで IAP に加えてアプリ側でも多層防御が効く。

```bash
gcloud run services update ttweb --region=asia-northeast1 --update-env-vars IAP_REQUIRE_JWT=true,IAP_AUDIENCE=<ログに出たaudの値>
```

さらにメールアドレスでも絞る場合は `IAP_ALLOWED_EMAILS` を設定する
（カンマ区切り）。未設定なら IAP の IAM ポリシーのみに委ねる。

届かなかった場合は `IAP_REQUIRE_JWT` を有効化してはならない（全リクエストが
401 になる）。その場合もアクセス制御自体は IAP がエッジで行っているため安全。

## シークレットの値を更新する場合

新しいバージョンを追加すれば、`:latest` 参照のため次回デプロイで反映される。

```bash
gcloud secrets versions add ANTHROPIC_API_KEY --data-file=- --project=thinktankweb-483408
```

## IAP を無効化する場合

```bash
gcloud run services update ttweb --region=asia-northeast1 --no-iap
```

無効化する場合は `IAP_ENABLED` も同時に外すこと。付けたままだと
`apiAuth` が IAP を前提に素通しするため、公開状態になる。

## 既知の制約

- IAP をロードバランサと Cloud Run サービスの両方に設定することはできない
- IAP は呼び出し元のIDを置換するため、Pub/Sub など独自の認証に依存する
  呼び出しは失敗する
- Cloud CDN とは非互換
- レイテンシが増加する
- Electron 版は `localhost:8080` の自前サーバーを使うため影響を受けない。
  ただし `electron/main.cjs` の `storage:syncFromServer` から Cloud Run へ
  同期したい場合は、デスクトップOAuthクライアントでIDトークンを取得して
  `Authorization: Bearer` を付ける実装が別途必要になる
