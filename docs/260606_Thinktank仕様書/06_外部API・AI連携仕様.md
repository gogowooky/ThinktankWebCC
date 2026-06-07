# Thinktank アプリケーション仕様書：06. 外部API・AI連携仕様

本ドキュメントは、アプリケーションで利用されるAI（大規模言語モデル）との対話機能、Google Drive API を使用したファイルのアップロード機能、およびセマンティック検索（意味検索）の現状仕様について定義します。

---

## 1. SSE ストリーミングチャット仕様

AIアシスタントとの対話は、サーバー送信イベント（SSE: Server-Sent Events）を用いて文字単位でリアルタイムにストリーミング出力されます。

### 1.1 クライアント側制御（`ChatApiService.ts`）
1.  **リクエスト送信**: `/api/chat/messages` に対し、`messages` (対話履歴の配列) と `systemPrompt` (システム指示文) を JSON 形式で POST 送信します。
2.  **ストリームの読み込み**: `Response.body.getReader()` からチャンク（Uint8Array）を逐次読み込みます。
3.  **デコードと行分割**: `TextDecoder` を用いてデコードし、改行文字 `\n` でスプリットします。未完了の行はバッファに保持して次のチャンクと結合します。
4.  **データ抽出とパース**:
    *   行頭が `data: ` で始まっている場合、その直後（6文字目以降）のテキストを取り出し、JSON としてパースします。
    *   イベント型に応じて以下のコールバックを実行します。
        *   `{ "type": "delta", "text": "..." }`: 文字の追記（`onDelta` コールバック）
        *   `{ "type": "done" }`: 終了処理（`onDone` コールバック）
        *   `{ "type": "error", "message": "..." }`: エラーハンドリング（`onError` コールバック）

### 1.2 サーバー側プロバイダー制御（`ChatService.ts`）
APIサーバーは、環境変数 `AI_PROVIDER` の設定に応じて以下の SDK を切り替えてストリームを返します。レスポンスヘッダーには `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no` を設定します。

#### ① Anthropic Claude (`anthropic`)
*   **環境変数**: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (デフォルト `claude-3-5-sonnet-20241022`)
*   **処理**: SDK の `client.messages.stream` を使用し、`text` イベントを受け取って `delta` パケットを送出します。

#### ② OpenAI (`openai`)
*   **環境変数**: `OPENAI_API_KEY`, `OPENAI_MODEL` (デフォルト `gpt-4o`), `OPENAI_BASE_URL` (プロキシ経由などでの差し替え用)
*   **処理**: `client.chat.completions.create` で `stream: true` を指定し、ジェネレーターを回して `delta` パケットを送出します。

#### ③ Google Gemini (`gemini`)
*   **環境変数**: `GEMINI_API_KEY`, `GEMINI_MODEL` (デフォルト `gemini-1.5-flash`)
*   **処理**: `@google/generative-ai` の `generateContentStream` を使用し、チャンクから `chunk.text()` を取り出して `delta` パケットを送出します。

---

## 2. チャットコンテキストの自動連携仕様

右パネル（ReThinkPanel）または WorkoutPanel 内のチャットビューにおいて、AIに送信されるプロンプトには、ユーザーの入力に加えて**現在の編集コンテキスト（対象Thinkデータ）**が自動的に付加されます。

*   **コンテキスト抽出ソース**:
    *   `WorkoutPanel` で最後にクリック（フォーカス）されたエリアオブジェクト（`TTWorkoutArea`）。
    *   そのエリアにバインドされている `ResourceID` (ThinkID)。
*   **連携プロパティ**: `StorageManager` 経由で取得した該当 Think データの本文（`Content`）を、システムプロンプトまたは会話の最初のコンテキストブロック（`[Context: ThinkID]`）として挿入し、AIがユーザーの見ている画面を理解した上で回答できるようにします。

---

## 3. Google Drive ファイルアップロード仕様

外部からファイル（画像、PDF、ドキュメント等）をドラッグ＆ドロップした際、サーバーを経由して Google Drive の日付フォルダへアップロードし、そのファイルへの共有URLを取得してメモ内等に挿入します。

### 3.1 サーバーAPI（`POST /api/drive/upload`）
*   **リクエスト**: `multipart/form-data` 形式で `file` オブジェクトと、オプションで `date` 文字列（`yyyy-mm-dd`）を送信します。

### 3.2 Google Drive 連携ロジック (`driveService.ts`)
1.  **初期化**: 環境変数 `GOOGLE_SERVICE_ACCOUNT_KEY` （サービスアカウントキーのJSON）を用いて Google 認証を構築し、スコープ `https://www.googleapis.com/auth/drive` で API クライアントを初期化します。
2.  **親フォルダの解決**:
    *   Drive のルートに `Thinktank` という名称の親フォルダが存在するか検索（`mimeType='application/vnd.google-apps.folder'` 且つ `trashed=false`）し、存在しなければ新規作成して ID を記憶します。
3.  **日付サブフォルダの解決**:
    *   指定された日付（または今日の日付）の名称のフォルダを、親フォルダ `Thinktank` の配下に作成または解決します（`getOrCreateDateFolder`）。
4.  **アップロードと権限変更**:
    *   ファイルを該当する日付サブフォルダ配下に保存します。
    *   アップロード成功後、アップロードされたファイルの閲覧制限を変更（`permissions.create`）します。
        *   `role`: `reader`
        *   `type`: `anyone` (リンクを知っている人全員が閲覧可能)
5.  **返却**: 生成された `fileId` と、Drive 上で直接表示・ダウンロードが可能な `webViewLink` を返却します。

---

## 4. セマンティック検索機能の廃止状況

かつて実装されていた、BigQuery上の `tt_embeddings` テーブルを用いたベクトル類似度（コサイン類似度）に基づく「セマンティック検索（意味検索）」機能は、**現在廃止（ダミー化）**されています。

*   **現状の動作**:
    *   サーバー初期化時に `VectorStoreService` は `tt_embeddings` テーブルが存在する場合、テーブルごと削除（Drop）する処理のみを行います。
    *   `upsert`、`delete` メソッドは中身のないダミー関数に置換されています。
    *   `search` クエリに対しては常に空の配列 `[]` を返却します。
*   **理由**: データストアの管理コスト削減、および `CONTAINS_SUBSTR` を用いた BigQuery の高速全文検索への統合・一本化のため。
