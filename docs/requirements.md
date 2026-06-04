# Thinktank 要件定義

現在実装済みの機能を記録したドキュメント。  
アプリの概念・差別化の軸は `docs/concept.md` を参照。

---

## 画面構成

5つのパネルで構成される。

| パネル | 位置 | 役割 |
|--------|------|------|
| ThinktankPanel | 左 | Vault一覧・検索・フィルタ |
| WorkoutPanel | 中央 | Think編集・AI作業領域 |
| OverviewPanel | 右上 | Thought管理・プロファイル表示 |
| ReThinkPanel | 右下 | AI主導の再思考チャット |
| WorkoutToolBar | 下部固定 | モード切り替えバー |

---

## ThinktankPanel

3つのViewModeを切り替える：

- **filter**（Think一覧）— 検索・絞り込み・一覧表示
- **chat**（AI相談）— Think整理についてAIと対話
- **settings**（設定）— レイアウト設定

### フィルタ機能

| 機能 | 詳細 |
|------|------|
| テキスト絞り込み | タイトル・キーワード対象、入力履歴付き |
| 作成日フィルター | 日付指定 + 範囲指定（`+Nd` `-Nd` `+-Nd` `@Nd`） |
| 更新日フィルター | 作成日と同仕様 |
| 全文検索 | Enter実行、コンテンツ本文を検索 |
| 種別フィルター | ContentType 6種をボタンで個別ON/OFF |

範囲指定フォーマット：
- `+Nd` — N日以降
- `-Nd` — N日以前
- `+-Nd` — 指定日の前後N日
- `@Nd` — 現在から遡りN日

### 一覧表示

- デフォルトソート：UpdatedAt 降順
- 表示カラム（デフォルト表示はNameのみ、他は非表示で切り替え可）：
  - Name（タイトル）
  - ID（作成日）
  - UpdatedAt（更新日）
  - ContentType（種別）
  - Keywords（キーワード）
  - RelatedIDs（関連ID）
- カラムのドラッグ&ドロップで並べ替え
- チェックボックスによる複数選択・一括削除
- 「Think作成」ボタン：選択ThinkからThought生成
- 「チャット保存」ボタン：会話をchat型Thinkとして保存

---

## WorkoutPanel

### ペイン分割

- BSPツリー構造で縦分割・横分割を自由に組み合わせ
- ドラッグ&ドロップでペイン内容の入れ替え・リサイズ
- 幅・高さ均等化ボタン

### 左側ツールバー（WorkoutRibbon）

- ペイン追加（左/右/上/下）・分割（左/右/上/下）
- ペイン削除・全クリア
- 新規メモ・テーブル作成
- 読み込み・保存
- TextEditor設定パネル切り替え

### メディアタイプ

ContentType に応じてメディアタイプが自動選択される：

| ContentType | MediaType | 表示内容 |
|-------------|-----------|----------|
| markdown | markdown | Markdownプレビュー |
| thought | datagrid | テーブル形式 |
| table | datagrid | テーブル形式 |
| chat | chat | チャット表示 |
| その他 | texteditor | Monaco Editor |

手動切り替えも可能（card / graph を含む全6種）。

### Monaco Editor 設定項目

- 行番号表示 / 折り返し / ミニマップ
- 全角空白表示 / Unicode強調
- 括弧色分け
- 強調ワード（5色定義）
- 背景色・文字色・選択背景色・出現背景色
- 見出しスタイル（5段階、色・太字・下線）

### D&D機能

- Think間の内容入れ替え（内部D&D）
- URL・ファイルパスのドロップ → links型Think自動作成
- linksペインへのリンク追記

---

## OverviewPanel

- 複数ThinkをD&D・チェック選択で関連付けてThoughtを構成
- Thoughtプロファイル表示・編集：
  - タイトル編集・保存
  - 関連Thinkリスト（ID・名前表示）
  - フィルター条件表示（`> filter_text` 形式）
  - メタデータ（作成日、更新日、キーワード、関連ID）

---

## ReThinkPanel

- 現在フォーカスされているThink・Thoughtの次の展開をAIに相談
- SSEストリーミング対応
- スクロール移動ボタン（前/次のユーザーメッセージ）

---

## WorkoutToolBar（下部バー）

6つのモードを切り替えるバー。

| モード | 機能 |
|--------|------|
| Status | Ctrl修飾キー・マウス座標・フォーカス状態の可視化 |
| Highlight | テキスト強調パターン指定（入力履歴付き） |
| KeyAction | キーボード・マウス・タッチイベント監視 |
| Command | コマンド入力欄 |
| Translate | 翻訳入力欄 |
| Reminder | リマインダー設定欄 |

その他：Copyright表示トグル、バー縮小・拡大切り替え。

---

## データモデル

### TTThink（クライアント側）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| ID | string | UUID（作成日時をデフォルト） |
| Name | string | タイトル（1行目から自動抽出） |
| Content | string | フルコンテンツ（タイトル＋本文） |
| ContentType | ContentType | 種別（下記6種） |
| VaultID | string | 所属VaultのID |
| Keywords | string | カンマ区切りキーワード |
| RelatedIDs | string | カンマ区切り関連ThinkID |
| IsMetaOnly | boolean | 本文未フェッチ状態フラグ |
| UpdatedAt | string | ISO 8601形式の更新日時 |
| IsDirty | boolean | 未保存変更フラグ |

### ContentType（6種）

| 種別 | 用途 |
|------|------|
| memo | 一般メモ |
| thought | 複数ThinkをまとめたThought |
| table | テーブルデータ |
| links | URLリンク集 |
| chat | AI会話ログ |
| nettext | Web取得テキスト |

### Thoughtの特殊フォーマット

```
# Thoughtのタイトル
* <ThinkID1>
* <ThinkID2>
> filter_text
```

### BigQuery スキーマ（thinktank.vault テーブル）

| カラム | 型 | 説明 |
|--------|-----|------|
| file_id | STRING | PRIMARY（UUID） |
| file_type | STRING | "md"（固定） |
| category | STRING | ContentType（クラスタリングキー） |
| title | STRING | タイトル（1行目） |
| content | STRING | 本文（2行目以降） |
| keywords | STRING | カンマ区切りキーワード |
| related_ids | STRING | カンマ区切り関連ID |
| size_bytes | INT64 | コンテンツサイズ |
| is_deleted | BOOL | 削除フラグ（論理削除） |
| created_at | TIMESTAMP | 作成日（REQUIRED） |
| updated_at | TIMESTAMP | 更新日（REQUIRED、UPSERT時に更新） |

---

## AIチャット機能

### 対応プロバイダー（環境変数 `AI_PROVIDER` で切り替え）

| プロバイダー | デフォルトモデル | 環境変数 |
|-------------|----------------|---------|
| anthropic（デフォルト） | claude-3-5-sonnet-20241022 | `ANTHROPIC_MODEL` |
| openai | gpt-4o | `OPENAI_MODEL` / `OPENAI_BASE_URL` |
| gemini | gemini-1.5-flash | `GEMINI_MODEL` |

### 通信仕様

- SSEストリーミング
- エンドポイント: `POST /api/chat/messages`
- リクエスト: `{ messages: ChatRequestMessage[], systemPrompt: string }`
- レスポンス: `{ type: 'delta'|'done'|'error', text?, message? }`
- AbortControllerで中断可能

---

## ストレージ・同期

### ローカルストレージ（Electron IPC）

保存場所: `{userData}/thinktank/vault/{id}.json`

| IPCハンドラー | 機能 |
|--------------|------|
| `storage:listMeta` | メタ一覧取得（本文除く） |
| `storage:getContent(id)` | 本文取得 |
| `storage:save(...)` | 保存 |
| `storage:delete(id)` | 論理削除 |
| `storage:search(query)` | 全文検索 |
| `storage:syncFromServer(url)` | BigQueryからの同期 |

### 同期ロジック

- BigQueryのメタとローカルを比較
- サーバー側が新しい場合のみダウンロード
- 戻り値: `{ added, updated, skipped, total }`

---

## Electron設定

- ウィンドウサイズ: 1400 × 900px
- contextIsolation: true / nodeIntegration: false
- 開発時: `http://localhost:5173` をロード + DevTools自動起動
- 本番時: `dist/index.html` をロード
