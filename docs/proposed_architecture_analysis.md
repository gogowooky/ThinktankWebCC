# Thinktank バージョンアップに向けた構成案・技術設計分析

提示された3つの指針ドキュメント（`concept.md`、`concept_ui.md`、`additions.md`）と、現在の実装ソースコード（データモデル、ストレージ抽象、Electronメインプロセス等）を照らし合わせ、将来展開に向けて「不足している詳細仕様や構成案」を分析しました。

これらを「実装可能な設計」に落とし込むための構成案を提示します。

---

## 1. 第一の柱：追体験（タイムライン）のデータ構造と履歴管理

### 現状と方針のギャップ
`concept.md` では、「履歴は Think 本体とは別ファイル/別レコードに持つ」「スナップショットは1日の終わりに半自動で保存する」「履歴は個別Thinkの更新履歴（Think層）と、AI要約ダイジェスト（Thought層）の2層構造」と決定されています。
しかし、これらを保存するための**データスキーマ（カプセル化方法）**や、**ストレージ層（LocalFS/Electron/BigQuery）へのAPI拡張設計**が定義されていません。

### 構成案
#### ① 履歴データの保存フォーマット（ThinkHistory）
履歴データを表す `TTThinkHistory`（仮称）を定義し、個々のThinkに紐づけて保存します。

* **ローカル/Electronストレージ (JSON形式)**: 
  `app.getPath('userData')/thinktank/history/` ディレクトリを新設し、`{ThinkID}_{timestamp}.json` のファイル名で保存します。
  ```json
  {
    "historyId": "2026-05-26-120000_2026-05-26-235959", 
    "thinkId": "2026-05-26-120000",
    "timestamp": "2026-05-26T23:59:59Z",
    "title": "今日の思考メモ",
    "content": "# 今日の思考メモ\nここに本文の履歴がフルテキストで入ります...",
    "contentType": "memo",
    "keywords": "アイデア,設計",
    "relatedIds": "2026-05-25-100000",
    "summary": "この日の更新では、将来展開に向けたタイムラインの設計について追記されました。"
  }
  ```
  > [!TIP]
  > Gitのような「差分（Diff）」で保持する案もありますが、本アプリの対象（中高齢者の追体験）を考えると、「過去の特定の日の状態」をロードする処理をシンプルにするため、**フルテキストスナップショット（日付メタデータ付き）**で保持する構成案を推奨します。
  > 
  > **【追記時の対応案（差分の検知）】**:
  > 日記のように同一ファイルに追記していく形式の場合、スナップショット生成時に「前回の履歴」とのテキスト差分を自動計算し、追加されたテキストのみを一時的に抽出してメタデータ（または `summary` や AI への要約プロンプト）に流し込むことで、ファイル全体の重複を避けて「本日の思考」だけをクリーンに記録することが可能です。

* **データ作成先（ストレージ）の将来的な変更容易性**:
  履歴データの保存先（ローカルのパスやBigQueryのテーブル）は、ストレージアクセスを担当する `IStorageBackend` インターフェースで完全に抽象化されています。そのため、後から「履歴データのみ外部のクラウド（S3やDropboxなど）」や「別のデータベース」に変更する場合でも、UIやデータモデル（`TTThink`、`TTVault`）のコードには一切影響を与えず、ストレージ層のクラス定義を差し替えるだけで容易に対応できます。

* **BigQueryストレージ (新規テーブル)**:
  `thinktank.vault` とは別に、履歴用の `thinktank.vault_history` テーブルを新設します。
  * `history_id`: STRING (PRIMARY KEY)
  * `think_id`: STRING (FOREIGN KEY)
  * `timestamp`: TIMESTAMP
  * `title`: STRING
  * `content`: STRING
  * `content_type`: STRING
  * `keywords`: STRING
  * `related_ids`: STRING
  * `summary`: STRING (AI要約)

#### ② ストレージAPI (`IStorageBackend`) の拡張案
履歴の保存・取得・削除をサポートするために、[IStorageBackend.ts](file:///c:/Users/shinichiro.egashira/Documents/ThinktankWebCC/src/services/storage/IStorageBackend.ts) および各バックエンドクラスに以下のAPIを追加します。

```typescript
export interface HistoryMeta {
  historyId: string;
  thinkId: string;
  timestamp: string;
  title: string;
  contentType: string;
  summary?: string;
}

export interface IStorageBackend {
  // ... 既存のメソッド ...

  /** 指定Thinkの履歴メタデータ一覧を取得（タイムライン用） */
  listHistoryMeta(thinkId: string): Promise<HistoryMeta[]>;

  /** 履歴の本文を取得する */
  getHistoryContent(historyId: string): Promise<string | null>;

  /** スナップショット履歴を保存する */
  saveHistory(payload: {
    thinkId: string;
    timestamp: string;
    fullContent: string;
    summary?: string;
  }): Promise<HistoryMeta>;
}
```

#### ③ 「日末半自動」スナップショット生成のトリガー設計
  「1日の終わりに半自動で作る」をUI上どう実現するかの構成案です。
  * **トリガー案**:
    1. **アプリ終了時の確認（自動検知）**: Electronの `before-quit` イベントなどを捕捉し、当日中に `IsDirty` が `true` になった（一度でも変更・保存された）Thinkがある場合、「本日編集した〇件のメモのスナップショット（履歴）を作成しますか？」とダイアログで確認し、一括で `saveHistory` を走らせる。
    2. **ReThinkパネル「まとめ」ボタンとの連動**: ReThinkで本日分のまとめを実行した際、対象となるThinkのその日の最終状態を自動的にスナップショットとして履歴保存する。
    3. **アプリ起動時の未作成検知（保険）**: アプリ起動時に、前日（または直前の起動セッション）に更新があったにもかかわらず、対応するスナップショット履歴が保存されていないThinkを自動検出します。「昨日（〇月〇日）編集した〇件のメモのスナップショットが作成されていません。作成しますか？」というダイアログで作成要否を確認し、漏れを防止します。

---

## 2. 第二の柱：相関グラフ（近さ）による再アクセスの可視化

### 現状と方針のギャップ
`react-force-graph` を用いたグラフメディアは既に存在しますが、「近さ指標の切替」や「重み付けの計算ロジック」、「全データ描画時のパフォーマンス対策」が定義されていません。

### 構成案
#### ① 動的近さスコアの計算アルゴリズム
JavaScript（フロントエンド）側で、以下の3つの指標を重み付け合成してエッジ（線）の長さを計算します。

$$\text{DistanceScore} = w_{\text{emb}} \cdot (1 - \text{Similarity}) + w_{\text{time}} \cdot \text{TimeDecay} + w_{\text{link}} \cdot \text{LinkFactor}$$

* **Similarity（意味的類似度）**: `TTEmbeddings` または BigQuery ベクトル検索から得られるコサイン類似度（0.0〜1.0）。
* **TimeDecay（日時近接度）**: 
  現在開いているThink/Thoughtの更新日時と、対象Thinkの更新日時の差（日数）から計算。
  $$\text{TimeDecay} = 1 - \frac{1}{1 + \alpha \cdot \text{days\_diff}}$$ （$\alpha$ は減衰係数）
* **LinkFactor（明示的リンク）**:
  `RelatedIDs` に互いのIDが含まれている場合は `0.0`（最も近い）、そうでない場合は `1.0`。
* **パラメータの動的変更**:
    重み（$w_{\text{emb}}, w_{\text{time}}, w_{\text{link}}$）を [TTUIStateManager.ts](file:///c:/Users/shinichiro.egashira/Documents/ThinktankWebCC/src/views/TTUIStateManager.ts) の状態変数（`__tt_ui_state__`）に登録し、スライダーなどのUI操作でリアルタイムにグラフの結合度合い（引き寄せの強さ）が変化するようにします。
  
  > [!NOTE]
  > **【計算アルゴリズムの拡張性】**:
  > 近さスコアの計算ロジックはフロントエンドの独立した計算ユーティリティ（例: `utils/graphUtils.ts`）に切り出すため、後から新しい変数（例: キーワードの一致回数など）を追加したり、計算式自体を変更（掛け算モデルや非線形モデルに変更）することは容易です。

#### ② スケール・パフォーマンス対策
全データをそのまま `react-force-graph` に流すと、描画が非常に重くなります。
* **構成案**: 
  1. **近傍展開フィルタリング**: 開いているThought/Thinkから、合成近さスコアが一定以上の「上位N件（例: 50〜100件）」のみを動的にグラフへ追加する。
  2. **「再浮上」の視覚的強調**: 
    「しばらく育てていない（更新日が古い）が、現在の文脈に近いThink」を、ノードの色（例: 警告色）やサイズで強調表示し、ワンクリックで開けるようにする。

#### ③ Linkの「ワンクリック起動」とPWA互換性のフォールバック
* **Electron環境**: [preload.cjs](file:///c:/Users/shinichiro.egashira/Documents/ThinktankWebCC/electron/preload.cjs) に `shell.openPath` や `shell.showItemInFolder` をIPC経由で呼び出すAPIを追加し、ローカルファイルを直接起動します。
* **PWA/クラウド環境**: ブラウザからは直接ファイルを起動できないため、**「パスをクリップボードにコピーする」「ダミーのショートカットファイルをダウンロードする」** などのフォールバックUIを表示し、環境に応じてシームレスに切り替えます。

---

## 3. 第三の柱：思考の補完（文脈付きChat）

### 現状と方針のギャップ
「今の文脈（Thought/Think）を渡した状態でAIと語る」ための、プロンプトに含める情報の切り出しルールと、本日分の「まとめ」機能のAIへの命令指示書（システムプロンプト）が不足しています。

### 構成案
#### ① 文脈切り出しアルゴリズム（コンテキスト削減）
Thought配下のすべてのThinkの全文をLLMに渡すと、トークン制限や料金が肥大化します。
* **構成案**: LLMに送るリクエストのコンテキストを、以下のように階層的に構成します。
    1. **アクティブThink（全文、または本日差分）**: 現在選択しているメモの全内容。
       > [!TIP]
       > **【日記形式への対応（差分の抽出）】**:
       > 日記のように日々追記していくメモの場合、ファイル全体を渡すとAIが本日の論点を見失う可能性があります。これに対処するため、今回の「スナップショット（履歴）」と最新の本文を比較し、**本日新しく追加された行（差分テキスト）**のみ、あるいは**ファイル内で「本日の日付セクション（例: `## 2026/05/26`）」以降**だけを抽出し、それを「本日の文脈」としてピンポイントでLLMに渡す工夫を行います。
    2. **現在のThoughtのサマリー**: 現在のThought配下にある他のThinkのタイトルとキーワード一覧（およびAIが要約したダイジェスト）。
    3. **関連する過去の思考（上位3〜5件）**: 相関グラフで類似度が高かった過去Thinkのタイトルと「ダイジェスト要約」のみを挿入（本文は除外）。

#### ② 本日分の「まとめ」プロンプトテンプレート
ReThinkパネルで「まとめ」ボタンを押した際、本日更新されたThink群から差分（スナップショット履歴）または本日の編集内容を抽出し、以下のシステムプロンプトでAIに要約させます。

```markdown
# システムプロンプト例：本日の思考ダイジェスト生成

ユーザーが本日行った以下の作業履歴（新規追加、編集差分、チャット対話）を分析し、以下の3点を含んだ日本語のダイジェストを生成してください。

1. **本日の主な思考の動き**: 今日、ユーザーがどのような主題に興味を持ち、考えを深めたか。
2. **過去の自分の考えとの接点・変化点**: 過去のメモ（添付された関連メモのサマリー）と比較して、考えがどう変化したか、あるいは何が補完されたか。
3. **次の展開に向けた問いかけ**: 思考をさらに持続・深化させるために、次にどのような方向に目を向けるべきか、1〜2問の「控えめな問い」を提示してください。
```

---

## 4. 第四の入力経路：WebText取り込み（CF_HTML自動補完）

### 現状と方針のギャップ
手動コピペを軸にしつつ、WindowsのクリップボードHTMLフォーマット（CF_HTML）から `SourceURL:` を自動補完する実装の仕組みが未定義です。

### 構成案
Windows OS上でブラウザ等からWebテキストをコピーすると、クリップボードにHTML形式で保存され、その中にメタデータ（CF_HTMLヘッダー）が含まれます。

1. **メインプロセス（Electron）側の実装**:
   [main.cjs](file:///c:/Users/shinichiro.egashira/Documents/ThinktankWebCC/electron/main.cjs) にて、クリップボードから生HTML（CF_HTMLヘッダーを含む文字列）を読み取ってパースするIPCハンドラーを追加します。
   ```javascript
   ipcMain.handle('clipboard:getSourceUrl', () => {
     const html = clipboard.readHTML();
     // WindowsのCF_HTMLヘッダーからSourceURLを抽出
     const match = html.match(/SourceURL:(https?:\/\/[^\s\r\n]+)/);
     return match ? match[1] : '';
   });
   ```
2. **フロントエンド側の実装**:
   Workoutパネルで新規 `nettext`（WebText）を作成し、コピペ（Ctrl+V）を検知したタイミングで上記IPCを呼び出し、「出典URL」入力欄にURLが空である場合のみ自動流し込み（オートフィル）を行います。

---

## 5. アプリ状態管理（additions.mdの特徴）との統合

`additions.md` に記載されている「設定もデータ（`__tt_ui_state__` / `__tt_shortcuts__`）」という優れたアーキテクチャに、新機能を美しく統合します。

### 構成案
#### ① UI状態変数 (`PROP_SPECS`) への追加項目
[TTUIStateManager.ts](file:///c:/Users/shinichiro.egashira/Documents/ThinktankWebCC/src/views/TTUIStateManager.ts) に、今回の新機能に対応する以下のキーを追加します。これらは `__tt_ui_state__` に自動保存されます。

| キー名 | 型 | デフォルト値 | 説明 |
|---|---|---|---|
| `Overview.ShowTimeline` | `boolean` | `false` | Overviewパネルで新規のタイムライン（追体験）モードを表示するかどうか |
| `Graph.WeightEmbedding` | `number` | `0.5` | 相関グラフにおける「意味的類似度」の重み (0.0〜1.0) |
| `Graph.WeightTime` | `number` | `0.3` | 相関グラフにおける「作業日時の近接度」の重み (0.0〜1.0) |
| `Graph.WeightLink` | `number` | `0.2` | 相関グラフにおける「RelatedIDs」の重み (0.0〜1.0) |
| `Backup.AutoSnapshotOnClose` | `boolean` | `true` | アプリ終了時に本日分のスナップショット作成確認を行うか |

#### ② ショートカットキーバインディング (`__tt_shortcuts__`) への追加案
キーボード操作による快適な追体験・補完操作のために、以下のアクションを追加します。

* `ui:toggle-timeline` (Overviewパネル): タイムライン表示とThink一覧の切り替え
* `action:summarize-today` (ReThinkパネル): 本日の思考まとめ処理のトリガー
* `action:open-link-file` (Workout/Linksパネル): 選択したLinkファイルのワンクリック起動
  
  > [!IMPORTANT]
  > **【名前やキー割り当ての変更容易性】**:
  > アクション名や割り当てるキーの組み合わせは、コードに直接書くのではなく、保管庫内の `__tt_shortcuts__` Think（table形式）でデータとして一元管理されます。したがって、後からキーの名前や割り当てを変更したい場合は、アプリ内のDataGridエディタから行を書き換えて保存（Ctrl+S）するだけで、コードの修正・再デプロイを一切行うことなく、即座に適用と名前変更が可能です。

---

## 6. 実装ロードマップ案（バージョンアップのステップ）

1. **フェーズ1: 履歴データ構造の決定とストレージAPI拡張 (Backend & Database)**
   * LocalFS / BigQuery への履歴用ストレージI/Oの実装。
2. **フェーズ2: Overviewパネルへの「タイムライン」表示と「日末半自動」履歴生成の統合 (UI & Frontend)**
   * タイムラインビューのReactコンポーネント作成。アプリ終了時の一括スナップショット確認ロジック実装。
3. **フェーズ3: Workoutパネルの相関グラフ（近さスコア・再浮上・起動連携）の拡張 (Core Logic & UI)**
   * 動的近さスコアの計算実装。Electron `shell` 連携の実装。
4. **フェーズ4: ReThinkパネルの「まとめ」ボタンと文脈付きChat（思考補完）の実装 (AI Integration)**
   * 本日差分要約および、文脈圧縮アルゴリズムの実装。
5. **フェーズ5: WebText取り込み時のクリップボード解析 (Integration)**
   * Windows CF_HTMLからのURL自動補完実装。
