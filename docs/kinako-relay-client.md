# きなこ（外部クライアント）向け: Firestore 中継への書き込み仕様

シンクタンク Web モードの PC へ、外部クライアント（きなこ）が Firestore 中継経由で
`mcp.toolCall` / `kinako.request` を依頼するための仕様。
以下はコードから抽出した内容であり、**コードに無い事項は「未定」と明記**している。

出典: `shared/relayProtocol.ts`, `shared/relayCrypto.ts`, `shared/kinakoRequest.ts`,
`shared/firebaseAuth.ts`, `firestore.rules`, `electron/relayAgent.cjs`, `src/platform/web/FirestoreRelayClient.ts`

> 本書に、トークン・鍵（Pairing Secret）・Firebase 資格情報の実値は書かない。

---

## 1. 全体像

```
きなこ ──(E2EE 暗号化した依頼を Firestore へ書く)──▶ users/{uid}/relayRequests/{requestId}
                                                       │ status: queued
対象PC(Electron, Web モード・PC連携ON) ◀── onSnapshot ──┘
   claim(queued→running) → 復号 → 実行 → 暗号化した応答を書く(succeeded / failed)
きなこ ◀── 依頼ドキュメントの更新を監視(または読み取り)して応答を復号
```

- PC が停止中でも依頼は `queued` のまま溜まり、PC が起動して待ち受けを再開すると処理される。
  ただし `expiresAt` を過ぎた依頼は `expired` になり実行されない（§4.4）。
- 中継の処理対象になるのは **Web モードの PC のみ**。`kinako.request` は `mode: "web"` のみ受理（Local は §6.3）。

## 2. Firestore の構造

REST のベース URL（`firestoreUserDocumentsBaseUrl`）:

```
https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents/users/{uid}
```

| パス | 用途 |
|---|---|
| `users/{uid}/devices/{deviceId}` | PC のハートビート。フィールド `deviceId`, `deviceName`, `lastHeartbeatAt`（ISO文字列）。PC が PATCH で更新 |
| `users/{uid}/relayRequests/{requestId}` | 依頼ドキュメント（§3） |
| `users/{uid}/relayRequests/{requestId}/chunks/{req_N \| res_N}` | 大きなペイロードの分割（§3.3） |

- `projectId`: Firebase プロジェクト ID。**値の共有方法は未定**（PC 側設定 `firebaseProjectId` に保存されている）。
- `uid`: PC がログインしている Firebase 利用者の uid。`firestore.rules` は `users/{userId}/**` を `request.auth.uid == userId` の本人のみに許可する。
  したがって **きなこは PC と同じ Firebase 利用者として認証した ID トークンで書く必要がある**。
  きなこ用の認証方式（同一アカウントでの認証 / 専用アカウント等）は **未定**（コードに規定なし。専用アカウントを使う場合、rules が uid 一致を要求するため別 uid では書けない）。
- 認証ヘッダ: `Authorization: Bearer {Firebase ID トークン}`（Web 版クライアントの実装）。

## 3. 依頼ドキュメント

### 3.1 作成（REST の例）

`POST {base}/relayRequests?documentId={requestId}`、ボディ（Firestore REST 形式）:

```json
{
  "fields": {
    "requestId":         { "stringValue": "<requestId>" },
    "targetDeviceId":    { "stringValue": "<対象PCの deviceId>" },
    "kind":              { "stringValue": "mcp.toolCall" },
    "status":            { "stringValue": "queued" },
    "createdAt":         { "stringValue": "<ISO8601>" },
    "updatedAt":         { "stringValue": "<ISO8601>" },
    "expiresAt":         { "timestampValue": "<ISO8601>" },
    "encryptedRequest":  { "stringValue": "<暗号文JSON文字列。チャンク分割時は空文字>" },
    "requestChunkCount": { "integerValue": "1" }
  }
}
```

- `kind`: `mcp.toolCall` または `kinako.request`（その他 `ping` 等の既存種別もある）。
- `status` は必ず `queued`。PC は `targetDeviceId == 自PCのdeviceId` かつ `status == queued` の依頼のみを待ち受ける（最大20件のクエリ）。
- `expiresAt` は **timestampValue**（PC は文字列・数値・Timestamp のいずれも解釈する）。
  Web 版クライアントの既定の有効時間は 90 秒（`timeoutMs`）。きなこ用の推奨値は **未定**（PC 停止中に溜める運用では長めが必要）。
- ドキュメント ID = `requestId`。Web 版は `req_{epochMs}_{random}` 形式を使う。`kinako.request` の `requestId` は §5.2 の制約を満たすこと。
- 書き込み前に `GET {base}/devices/{deviceId}` で `lastHeartbeatAt` を確認する流れが Web 版にある（90 秒以内なら生存）。
  **きなこが同じ確認をするかは未定**（PC 停止中に溜める運用ならスキップする必要がある）。

### 3.2 PC 側の状態遷移（`status`）

`queued` → `running`（`claimedBy`, `claimedAt` を記録）→ `succeeded` / `failed` / `canceled`、期限切れは `expired`。

- 取得はトランザクションで行われるため、同じ依頼が二重に実行されることはない。
- 応答書き込み時のフィールド: `succeeded` のとき `encryptedResponse`, `responseChunkCount`。`failed` のとき `errorMessage`。
  `canceled`（PC連携を OFF にした）のとき `errorMessage: "PC連携がOFFになりました。"`。
- `errorCode` フィールドは型定義にあるが、PC 側コードは書き込まない（常に未設定）。

### 3.3 チャンク分割

暗号文（JSON 文字列）が **600,000 文字を超える**場合、600,000 文字ごとに分割する。

- 先にチャンクを書き、その後に依頼ドキュメントを作る（`encryptedRequest` は空文字、`requestChunkCount` = チャンク数）。
- チャンクのパス: `relayRequests/{requestId}/chunks`、ドキュメント ID は **`req_{index}`**（応答側は `res_{index}`）。
- チャンクのフィールド: `index`（整数, 0 始まり）, `total`（整数）, `direction`（`"request"` / `"response"`）, `data`（文字列）。
- 結合は index 昇順。`total` と件数の不一致・欠番はエラー。
- 1 チャンクで収まる場合は `encryptedRequest` に直接入れ、チャンクは作らない。

## 4. E2EE（暗号化）

### 4.1 方式（`shared/relayCrypto.ts`）

- 鍵導出: PBKDF2-HMAC-SHA256、反復 100,000 回、salt 16 バイト（毎回ランダム）、鍵長 256bit。パスフレーズは **Pairing Secret の文字列を UTF-8 でそのまま**使う。
- 暗号: AES-256-GCM、IV 12 バイト（毎回ランダム）、AAD なし。
- 平文: 依頼 / 応答オブジェクトを `JSON.stringify` → UTF-8。
- 暗号文の形（これを JSON 文字列化したものが `encryptedRequest` / `encryptedResponse`）:

```json
{ "v": 1, "alg": "AES-256-GCM", "iv": "<base64>", "salt": "<base64>", "ct": "<base64>" }
```

  `ct` は GCM 認証タグ（16 バイト）を末尾に含む Web Crypto 標準の出力。base64 は通常の標準 base64（パディングあり）。

### 4.2 鍵（Pairing Secret）の共有手順

- PC 側: PC の「Firebase / PC連携」設定に表示される（PC ごとに生成、`rotatePairingSecret` で再生成可能）。Web 版は同じ値を手入力する。
- **きなこへの安全な受け渡し方法は未定**（コードに規定なし）。提案は報告書側に記載。コード・文書・コミットに平文で書かないこと。
- 鍵が一致しない場合、PC は復号に失敗して `failed`（`errorMessage` に復号失敗の文言）になる。

## 5. 依頼の平文（`RelayEnvelopePlaintext`）

暗号化する前の JSON:

```json
{
  "requestId": "<ドキュメント ID と同じ値>",
  "kind": "mcp.toolCall",
  "createdAt": "<ISO8601>",
  "payload": { }
}
```

`requestId`・`kind` は依頼ドキュメントのフィールドと一致させる（PC は平文側の `kind` を使って実行する）。

### 5.1 `kind: "mcp.toolCall"`

`payload`（`RelayMcpToolCallPayload`）:

```json
{ "name": "thinktank_search", "arguments": { "query": "…", "limit": 20 } }
```

- `name`: MCP ツール名（既存 8 ツール。名前・引数・応答の意味はインターフェイス仕様書が正本）。
- `arguments`: ツール引数（省略可）。
- 昇格の承認・Gate 通過承認・削除はツールとして公開されていない（呼ぶと `UNKNOWN_TOOL`）。
- 実行はキューに入った依頼を **1 件ずつ**ではなく並列に処理し得るため、順序依存の依頼は結果を待ってから次を出すこと（PC 側に順序保証の実装は無い）。

### 5.2 `kind: "kinako.request"`

`payload`（`KinakoRequestEnvelope`）の全フィールド:

```json
{
  "requestId": "kinako-20261110-0001",
  "targetPc": "<対象PCの deviceId または deviceName>",
  "mode": "web",
  "kind": "filing_proposal",
  "projectId": "<thinkid（任意。project_summary / discussion_summary では必須）>",
  "instructions": "<依頼内容。必須・20,000文字以内>",
  "sourceThinkIds": ["<thinkid>", "…"],
  "createdAt": "<ISO8601>",
  "requestedBy": "kinako"
}
```

検証ルール（`validateKinakoRequestEnvelope`）:

- `requestId`: 正規表現 `^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$`（3〜128 文字）。**冪等キー**。
- `targetPc`: 必須。
- `mode`: `web` または `local`。**中継で受理されるのは `web` のみ**（`local` は `INVALID_ARGUMENT`）。
- `kind`: `filing_proposal` / `project_summary` / `discussion_summary` / `promotion_candidates` のいずれか。
- `requestedBy`: 固定値 `kinako`。
- `instructions`: 必須、20,000 文字以内。
- `projectId`: 任意だが、`project_summary` と `discussion_summary` では必須。安全な thinkid 形式。
- `sourceThinkIds`: 任意、最大 100 件、重複は除去、各要素は安全な thinkid 形式。
- `createdAt`: Date.parse 可能な文字列（ISO 8601）。
- 未知のフィールドは捨てられる。

冪等性: 同じ `requestId` は結果をキャッシュして返し、再実行しない（最大 200 件を `kinako-results.json` に保持）。
実行中の同一 `requestId` は同じ実行に合流する。何も書かずに `failed` になった結果はキャッシュされないため、再送で再実行できる。

## 6. 応答

### 6.1 応答の平文（`RelayResponsePlaintext`）

復号後の JSON:

```json
{
  "requestId": "<依頼と同じ>",
  "kind": "mcp.toolCall",
  "completedAt": "<ISO8601>",
  "ok": true,
  "result": { },
  "error": "<ok:false のときのメッセージ>"
}
```

依頼ドキュメントの `status` が `succeeded` でも、平文の `ok` が `false` のことがある（実行時例外）。必ず `ok` を見ること。

### 6.2 `mcp.toolCall` の `result`

```json
{ "isError": false, "payload": { } }
```

- `payload`: ツールの応答本文を JSON としてパースしたもの（JSON でなければ文字列のまま）。
- エラー時は `isError: true` で、`payload` は構造化エラー
  `{ "ok": false, "error": { "code", "message", "thinkid?", "retryable" } }`。
  `code`: `NOT_FOUND` / `VERSION_CONFLICT` / `EDITING_IN_PROGRESS` / `INVALID_ARGUMENT` / `INVALID_ID` / `UNKNOWN_TOOL` / `INTERNAL_ERROR`。
- `mcp.toolCall` には `targetPc` 照合が**無い**（宛先は `targetDeviceId` のみ）。

### 6.3 `kinako.request` の `result`（`KinakoRequestResult`）

```json
{
  "requestId": "…",
  "targetPc": "…",
  "status": "done",
  "createdThinkIds": [],
  "updatedThinkIds": [],
  "candidateIds": [],
  "usedSourceIds": [],
  "conflicts": [{ "thinkid": "…", "code": "VERSION_CONFLICT", "reason": "…" }],
  "summary": "<AI の最終報告（任意）>",
  "failure": { "code": "…", "message": "…" },
  "completedAt": "<ISO8601>"
}
```

- `status`: `done` / `conflict`（書けなかった箇所あり）/ `failed`。
- 作成・更新・候補・使用材料の一覧は、AI の自己申告ではなく **実際の MCP ツール呼び出しの記録**から組み立てる。
- `failure.code`:
  - `INVALID_ARGUMENT`（検証エラー、`mode` が `web` 以外）
  - **`TARGET_PC_MISMATCH`**（`targetPc` がこの PC の `deviceId` / `deviceName` と一致しない。この場合 AI は実行されない。メッセージに宛先と自 PC の deviceId が入る）
  - `NOT_FOUND`（`projectId` の Project が無い）
  - `INTERNAL_ERROR`（MCP ホスト未初期化）
  - `AI_EXECUTION_FAILED`（AI CLI の実行失敗）
- 注意: これらの失敗は中継レベルでは `ok: true`・`status: succeeded` で返り、失敗は `result.status === "failed"` に入る。
  きなこ向けの状態は `relayStatusToKinakoStatus`（`queued`/`running` はそのまま、`succeeded` は `result.status`、`failed`/`canceled`/`expired` は `failed`）で求める。
- 応答が大きい場合は §3.3 と同様に `chunks/res_{index}` に分割され、`encryptedResponse` は空・`responseChunkCount` > 1 になる。

## 7. 対象 PC の識別

- `targetDeviceId`（ドキュメントのフィールド）と `payload.targetPc`（`kinako.request`）に使う識別子は、PC の **`deviceId`**。
- 形式: `pc_{ホスト名}_{ランダム6桁hex}`（Electron 版）。ホスト名は英数字・`_`・`-` 以外が `_` に置換される。例: `pc_MYHOST_a1b2c3`。
  - 旧形式 `pc_{ホスト名}`（ランダム部なし）も存在し得る。
  - 常駐エージェント版は接頭辞が `agent`、MCP サーバー版は `mcp`（いずれも中継対象は Electron の `pc_` 系のみ）。
- `targetPc` は `deviceId` のほか **`deviceName`（= OS のホスト名）** でも一致する。ただしホスト名はPC間で重複し得るので `deviceId` を推奨。
- 確認方法:
  1. PC の設定（Firebase / PC連携）に deviceId が表示される。
  2. `users/{uid}/devices/{deviceId}` ドキュメント（`deviceId`, `deviceName`, `lastHeartbeatAt`）を読む。同じ uid に複数 PC があれば、ここに複数ドキュメントが並ぶ。
- HTTP 経由の MCP（`electron/mcpHttpServer.cjs`）のトークンも deviceId に紐づく。別 PC のトークンは 403。

## 8. 未定事項（コードに規定なし）

- きなこ側の Firebase 認証方式（同一利用者アカウントでの認証手段・ID トークン取得/更新の方法）。
- `projectId` と `uid` の共有方法。
- Pairing Secret の受け渡し経路・ローテーション運用。
- きなこの依頼ドキュメントの推奨 `expiresAt`（PC 停止中に溜める場合の有効時間）。
- きなこが生存確認（ハートビート）をどう扱うか。
- 完了済み依頼ドキュメント・チャンクの削除（クリーンアップ）の担当と方法（PC 側コードに削除処理は無い）。
- 複数依頼の実行順序の保証（現状は保証なし）。
