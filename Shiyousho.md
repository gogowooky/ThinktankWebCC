# ThinktankGemini 仕様書

## 1. はじめに
本ドキュメントは、ThinktankGemini と同等の機能を持つアプリケーション（クローン）を開発するための技術仕様書である。
本プロジェクトは、思考整理と情報管理を目的とした、キーボード操作主体のデスクトップアプリケーションである。

## 2. 開発・動作環境

### 2.1. ターゲット環境
- **OS**: Windows 10 / 11 (64bit)
- **Framework**: .NET Framework 4.7.2 以上 (ターゲット: v4.7)
- **Runtime**: PowerShell 5.1 (System.Management.Automation)

### 2.2. 使用言語
- **C#**: 5.0 (またはそれ以上、ただしターゲットFWに準拠)
- **PowerShell**: 5.1 (スクリプティングおよびビジネスロジック)
- **XAML**: WPF UI定義

### 2.3. 依存ライブラリ (Reference Assemblies)
以下の外部ライブラリを `lib` フォルダ等に配置し、参照すること。
- **ICSharpCode.AvalonEdit.dll**: 高機能テキストエディタコンポーネント
- **Microsoft.Web.WebView2.Wpf.dll**: モダンWebブラウザコンポーネント (Edgeベース)
- **Microsoft.Web.WebView2.Core.dll**: WebView2 コア
- **System.Management.Automation.dll**: PowerShell ホスティング用
- **System.Xaml**: WPF依存
- **PresentationFramework / PresentationCore / WindowsBase**: WPFコア

## 3. システムアーキテクチャ

### 3.1. アーキテクチャ概要
本システムは「C#による薄いView/Model層」と「PowerShellによる厚いController/Logic層」で構成されるハイブリッドアーキテクチャを採用している。

- **C# (Host)**:
    - ウィンドウ管理、UIイベントのハンドリング
    - データモデルの保持 (`TTModels`)
    - PowerShell Runspace のホスティングとAPI公開 (`$global:Application`)
- **PowerShell (Guest)**:
    - 具体的なアクションの実装 (`TTAction`)
    - アプリケーションの状態管理 (`TTStatus`)
    - 起動時の初期化処理 (`DefaultActions.ps1` 等)

### 3.2. コンテキスト共有
C#側で生成されたインスタンスは、`Runspace.SessionStateProxy.SetVariable` を通じてPowerShell側へ公開される。

| 変数名 | 型 | 説明 |
| :--- | :--- | :--- |
| `$global:Application` | `ThinktankApp.TTApplication` | アプリケーションのルートオブジェクト。WindowやPanelへのアクセスを提供。 |
| `$global:Models` | `ThinktankApp.TTModels` | データモデルのルート。Actions, Events, Status 等を保持。 |
| `$global:RootPath` | `string` | アプリケーションのルートディレクトリパス。 |
| `$global:ScriptPath` | `string` | スクリプトファイルのディレクトリパス。 |

## 4. データモデル詳細
すべてのデータモデルは `TTObject` または `TTCollection` を継承する。

### 4.1. TTModels (データルート)
以下のコレクションを保持する。
- **Status (TTStatus)**: アプリケーションの状態管理（フォントサイズ、現在のモード設定など）。
    - 項目は `TTState`。`ID`, `Name`, `Value`, `From` プロパティを持つ。
- **Actions (TTActions)**: 実行可能なコマンドの定義。
    - 項目は `TTAction`。`ID` (名前), `Script` (ScriptBlockまたは文字列) を持つ。
    - メソッド `Invoke(Hashtable args, Runspace rs)` により実行される。
- **Events (TTEvents)**: キーバインディング定義。
    - 項目は `TTEvent`。`Context`, `Mods` (修飾キー), `Key` (キーコード) を持つ。
- **Memos (TTMemos)**: メモデータ。
- **Editings (TTEditings)**: 編集中のデータ保持用。
- **WebSearches**, **WebLinks**: Web関連リソース定義。

### 4.2. TTAction (アクション定義)
アクションはPowerShellスクリプトとして記述され、実行時に引数として `Tag` (Hashtable) を受け取る。
- **戻り値**: `bool` (成功: `$true`, 失敗/キャンセル: `$false`)。`ExMode` の継続可否判定に使用される。

## 5. UI機能仕様

### 5.1. 画面レイアウト
C# クラス `TTApplication` および `TTPanel` により管理される。
以下の5つのパネルを定義し、それぞれが独立した機能（モード）を持つ。
1. **Library**: データ一覧
2. **Index**: 索引
3. **Shelf**: 一時領域
4. **Desk**: 作業領域
5. **System**: ログ・ウェブ

### 5.2. パネルモード
各パネルは `Mode` プロパティにより表示内容を切り替える。
主要なモードの実装要件は以下の通り。

- **Editorモード**:
    - `AvalonEdit:TextEditor` を使用。
    - 行番号表示、シンタックスハイライト、矩形選択等のサポートが必要。
    - `Keyword` 入力欄によるテキスト検索・移動機能。
- **Tableモード**:
    - `WPF:DataGrid` を使用。
    - `TTCollection` 内のアイテムを表示。
    - `Keyword` 入力欄によるインクリメンタルフィルタリング（AND/OR検索対応）。
- **WebViewモード**:
    - `WebView2` を使用。
    - 指定URLの表示、DOM要素へのアクセス（JavaScript実行）。

### 5.3. キーバインディング論理
`View_TTApplication.cs` 内の `RebuildCurrentKeyTable` メソッドが中核となる。
コンテキスト文字列 `Panel-Mode-Tool-ExMode` をキーとしてイベントをマッチングし、優先順位を決定する。

1. **コンテキストマッチング**:
    - `TTEvent.Context` と現在のアプリ状態 (`CurrentPanel`, `CurrentMode` 等) を比較。
    - `*` はワイルドカードとして機能。
2. **スコア計算**:
    - 具体的な指定（`*` 以外）が多いほど高スコアとなり、優先される。
3. **ExMode**:
    - `ExMode` が有効な場合、該当する `ExMode` 定義を持つイベントが最優先される。
    - アクション実行結果が `$false` の場合、ExModeは解除される。

## 6. 実装すべき機能詳細

### 6.1. 必須機能
1.  **起動シーケンス**:
    - `DefaultActions.ps1` 等のスクリプトを順次読み込み、エラーハンドリングを行う。
    - `Initialize-TTStatus` を呼び出し、初期状態を適用する。
2.  **フォーカス制御**:
    - パネル間のフォーカス移動 (`Focus(panelName)`)。
    - モード切り替え時の適切なコントロールへのフォーカス設定。
3.  **アクション実行**:
    - キー入力イベントをフックし、適合する `TTAction` をPowerShell Runspace上で実行する。

### 6.2. 未実装・拡張予定機能 (Reference仕様)
以下の機能は現状のソースコード上ではコメントアウトまたは未定義だが、完全なクローンには実装が推奨される。

- **高度なエディタ操作**:
    - セクション（見出し）単位の移動・選択・折りたたみ。
    - インデント操作による階層構造の編集。
    - Markdown等の軽量マークアップ言語のサポート強化。
- **データ永続化**:
    - メモや設定のファイルへの保存・読み込み機能 (`SaveMemo`, `LoadMemo`)。
    - キャッシュ機構による高速化。
- **UIカスタマイズ**:
    - フォントサイズ、配色の動的変更。
    - パネルレイアウトの保存と復元。

### 6.3. テーブルフィルタリング仕様
`TTPanelTable.cs` に実装されているロジック：
- フィルタ文字列をスペースで分割 → **AND条件**（すべてのキーワードを含む）
- カンマで分割 → **OR条件**（いずれかのキーワードグループに一致）
- 各アイテム (`TTObject`) の `Matches(keyword)` メソッドにより判定。

---
*本書はプロジェクトのソースコード (`source/*.cs`, `script/*.ps1`) およびビルド構成に基づき作成された。*
