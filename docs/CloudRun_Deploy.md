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

OpenAI / Gemini も使う場合は同様に `OPENAI_API_KEY` `GEMINI_API_KEY` を作成する。
`deploy.ps1` は3つとも Cloud Run に渡すため、作成していないと**デプロイ自体が失敗する**
（存在しない Secret を参照するため）。使わないプロバイダは `deploy.ps1` の
`--update-secrets` から該当行を外すこと。

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

### 3-1. カスタム OAuth クライアントの登録（組織なしプロジェクトでは必須）

**この手順を飛ばすと、デプロイは成功するのに全リクエストが IAP の 502 で落ちる。**
症状は「レスポンスヘッダーに `x-goog-iap-generated-response: true` が付いた空の 502」
かつ「Cloud Run 側にリクエストログが1件も残らない」。IAP がコンテナに到達させる
前で止めているためである。

`thinktankweb-483408` は組織に属さない個人プロジェクトなので、IAP は自動では
OAuth クライアントを用意しない。また `gcloud iap oauth-brands` / `oauth-clients` は
2026-03-19 に完全停止済みで、`Project must belong to an organization.` を返すため
使えない。`gcloud iap web enable` も `--resource-type` が `app-engine` と
`backend-services` しか受け付けず Cloud Run には使えない。
（`gcloud iap web update` というコマンドは存在しない。）

したがって、**クライアントの作成だけは Console で行い、IAP への紐付けを gcloud で行う。**

1. Console → Cloud Run → `ttweb` → 「セキュリティ」タブ → IAP →
   「Configure in IAP」。ここから OAuth 同意画面（Google Auth Platform → Branding）の
   設定に誘導される。**Audience type は「External」を選ぶ**
   （個人 Gmail アカウントのプロジェクトでは「Internal」は選べない）。
2. 「Auto generate credentials」を使うか、Google Auth Platform → 「クライアント」で
   種類「ウェブ アプリケーション」の OAuth クライアントを自分で作成する。
3. 手動作成した場合は、そのクライアントの**承認済みのリダイレクト URI** に
   次を必ず追加する。抜けているとログイン時に `redirect_uri_mismatch` になる。

   ```
   https://iap.googleapis.com/v1/oauth/clientIds/CLIENT_ID:handleRedirect
   ```

   `CLIENT_ID` は `123456789-abcdef.apps.googleusercontent.com` のような完全な値。

4. クライアント ID とシークレットを IAP に紐付ける。

   ```bash
   gcloud iap settings set iap_settings.yaml --project=thinktankweb-483408
   ```

   `iap_settings.yaml` の中身:

   ```yaml
   access_settings:
     oauth_settings:
       client_id: CLIENT_ID
       client_secret: CLIENT_SECRET
   ```

   このファイルはシークレットを含むので、リポジトリに置かず適用後に削除すること。

5. 紐付けを確認する。`oauth_settings` が出力されれば成功。

   ```bash
   gcloud iap settings get --project=thinktankweb-483408
   ```

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

## トラブルシューティング

### `Cannot update environment variable [X] to the given type`

同名の変数が「平文の環境変数」として既に Cloud Run に設定されている状態で、
Secret 参照へ切り替えようとすると出る。平文側を消してから再デプロイする。

```bash
gcloud run services update ttweb --region=asia-northeast1 --remove-env-vars GOOGLE_SERVICE_ACCOUNT_KEY
```

現在どちらの型で入っているかは次で確認できる。`value:` なら平文、
`valueFrom.secretKeyRef` なら Secret 参照。

```bash
gcloud run services describe ttweb --region=asia-northeast1 --format="yaml(spec.template.spec.containers[0].env)"
```

### 公開URLが空の 502 を返す

レスポンスに `x-goog-iap-generated-response: true` が付き、かつ Cloud Run 側に
リクエストログが残らない場合は、IAP に OAuth クライアントが紐付いていない。
手順 3-1 を実施する。

### `[Server] GOOGLE_SERVICE_ACCOUNT_KEY not set — BigQuery/Drive/Embedding disabled`

Secret がリビジョンに渡っていない。`Private` / `SharedSecret` で入れ替えた直後の
リビジョンなどで起こる。`npm run deploy` を IAP 指定で再実行する。

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
