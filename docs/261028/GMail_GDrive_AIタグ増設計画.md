# GMail・GDrive・GPhoto・Gemini Notebook・AIタグ増設計画

対象書式:

- `[GMail:xxx]`
- `[GDrive:xxx]`
- `[GPhoto:xxx]`
- `[GNB:xxx]`
- `[GTP:>] yyy`
- `[Claude:>] yyy`
- `[AG:>] yyy`

GMail/GDriveの `xxx` はIDまたは検索文字、GPhotoの `xxx` はGoogle Photosの共有/プロダクトURLまたは検索文字、GNBの `xxx` はGemini Notebookのノートブック/チャット表示/アーティファクト共有URL、`yyy` はAIへ渡すクエリーテキスト。
状態: 計画のみ。コードは未変更（2026-10-28時点）。

## 1. 現状と実装方針

現在のタグ操作は `src/views/actions/textEditorCursorContentActions.ts` に集約され、次の順で動く。

1. カーソル位置から URL・パス・`[...]`タグを取得する。
2. `classifyTagSubTag` がタグ種別を判定する。
3. `TextEditor.CurrentEditor.DoOnCursorPos:{種別}:Open` を実行する。
4. タグ挿入とカーソルメニューは `docs/DefaultMenu.md` で定義する。

新タグもこのアクション経路に追加する。GMail/GDrive/GPhotoの起動と検索、GNBのリンク起動にGoogle APIやOAuthスコープは追加せず、認証済みブラウザセッションでGoogleのWeb画面を開く。これによりWeb版とElectron版で同じ動作にでき、Gmail/Google Photos/Gemini Notebookの追加権限も不要になる。

AIタグは、現行の `[Claude:>] 質問` などが「タグの後ろにある同じ行の文字列をクエリーにして外部AIを開く」実装に合わせる。本計画ではローカルAI CLIの実行ではなく、ブラウザのAIサービスを開く。

## 2. タグごとの動作仕様

### 2.1 GMail

| 入力 | 判定 | 動作 |
|---|---|---|
| `[GMail:18f3abc012345678]` | Gmailのスレッド/メッセージID | `https://mail.google.com/mail/u/0/#all/{ID}` を開く |
| `[GMail:from:example@example.com newer_than:7d]` | 検索文字 | Gmail検索画面を開く |

- キーの大文字・小文字は区別しない。
- ID判定は「16文字以上の16進文字列」を初期規則とする。それ以外は検索文字とする。
- 空の `[GMail:]` は開かず、ステータスバーに入力不足を表示する。
- 旧 `[MAIL:...]` は別タグとして現状互換を維持し、この作業では動作を変えない。

### 2.2 GDrive

| 入力 | 判定 | 動作 |
|---|---|---|
| `[GDrive:1AbCdEfGhIjKlMnOpQrStUv]` | Driveファイル/フォルダID | `https://drive.google.com/open?id={ID}` を開く |
| `[GDrive:開発計画 2026]` | 検索文字 | Google Drive検索画面を開く |

- ID判定は「20文字以上のURL-safe文字（英数字、`_`、`-`）」を初期規則とする。短い単語や日本語は検索文字とする。
- URL全体の貼り付けは既存のURL起動で扱えるため、`GDrive` タグ内ではIDまたは検索文字のみを受け付ける。
- 空の `[GDrive:]` は開かない。

### 2.3 GPhoto

| 入力 | 判定 | 動作 |
|---|---|---|
| `[GPhoto:https://photos.app.goo.gl/...]` | Google Photos共有リンク | 許可ホストを確認してそのURLを開く |
| `[GPhoto:https://photos.google.com/share/...]` | Google Photosプロダクト/共有URL | 許可ホストを確認してそのURLを開く |
| `[GPhoto:沖縄 2026]` | 検索文字 | Google PhotosのWeb検索画面を開く |

- URLは `URL` クラスで解析し、`https:` かつホスト名が `photos.google.com` または `photos.app.goo.gl` の場合だけ開く。文字列の部分一致で許可しない。
- URLでない値は検索文字とし、現行Google Photos Webの検索ルートを開く。このルートは公式API契約ではないため、実装時に実機確認し、無効ならGoogle Photosトップを開く動作へ倒す。
- Google Photos APIのメディアIDは永続識別子だが、ユーザーが開けるURLはAPIが返す `productUrl` であり、IDから汎用的なWeb URLを合成する公式契約はない。そのため第1段階では「写真IDだけで直接開く」ことは保証せず、Google Photosが生成したURLを正式な画像リンクとする。
- `baseUrl` のような画像バイト取得URLは有効期限があるため保存対象にしない。
- 空の `[GPhoto:]` や、`http:`、別ホストのURLは開かずエラーを表示する。
- Google Photosの「リンク共有」はリンクを知る人が閲覧できる場合がある。Thinkを共有・エクスポートする際の機密性に注意する。

参考（Google公式）:

- [Google Photos API: Access app-created media items](https://developers.google.com/photos/library/guides/access-media-items)
- [Google Photos API: MediaItem resource](https://developers.google.com/photos/library/reference/rest/v1/mediaItems)
- [Google Photos Help: Share photos & videos](https://support.google.com/photos/answer/6131416)

### 2.4 Gemini Notebook（GNB）

| 入力 | 判定 | 動作 |
|---|---|---|
| `[GNB:https://notebook.google.com/...]` | 現行のGemini Notebookリンク | 許可ホストを確認してそのURLを開く |
| `[GNB:https://notebooklm.google.com/...]` | 旧NotebookLMドメインの保存済みリンク | 許可ホストを確認してそのURLを開く（サービス側のリダイレクトに従う） |

- `xxx` はGemini Notebookの「リンクをコピー」または「チャット表示のリンクをコピー」で得たURLをそのまま保存する。パスやクエリーパラメータを作り直さない。
- URLは `URL` クラスで解析し、`https:` かつホスト名が `notebook.google.com` または `notebooklm.google.com` の場合だけ開く。文字列の部分一致で許可しない。
- ノートブックIDだけからURLを合成する公式契約は使わず、URL以外の値はエラーにする。GNBは「検索タグ」ではなく「Gemini Notebookへのリンクタグ」とする。
- 空の `[GNB:]`、`http:`、別ホスト、ユーザー情報を含むURL（`https://user@example.com@...`）は開かない。
- リンクを持っていても閲覧権限はGemini Notebook側の共有設定に従う。非公開ノートは許可されたGoogleアカウントだけが閲覧でき、公開ノートも公開解除後は以前の共有リンクが無効になる。
- チャット表示はソースやアーティファクトを画面上で隠すが、閲覧者のノートブック内容への基底のアクセス権を取り消すものではない。

参考（Google公式）:

- [Gemini Notebook Help: Create a notebook](https://support.google.com/gemininotebook/answer/16206563?hl=en)
- [Gemini Notebook Help: Use public notebooks and featured notebooks](https://support.google.com/gemininotebook/answer/16322204?hl=en)

### 2.5 AI

| タグ | 接続先 | 互換別名 |
|---|---|---|
| `[GTP:>] yyy` | ChatGPT | `GPT`、`ChatGPT` |
| `[Claude:>] yyy` | Claude | なし |
| `[AG:>] yyy` | Gemini Web（Antigravity系の接続先） | `Gemini` |

- `GTP` は依頼文の記載どおり正式な挿入タグとする。一般的な表記の `GPT` も互換別名として受け付ける。
- `:>` は「タグ後方の文字列をクエリーとする」マーカーとする。`yyy` は同じ行の行末までを取得し、先頭・末尾の空白のみ除く。
- クエリーは大文字・小文字、日本語、改行以外の記号を保持し、URLへ入れるときだけエンコードする。
- クエリが空の場合は各AIの新規会話画面だけを開く。
- 現行の `[AI:...]`、`[Gemini:>]`、`[ChatGPT:>]`、`[GPT:>]` は互換のため維持する。

## 3. 変更対象

### 3.1 タグの解析とURL生成を純粋関数へ分離

`textEditorCursorContentActions.ts` は登録、解析、URL生成、エディタ編集が1ファイルに集中している。新規 `src/utils/actionTag.ts`（仮名）に次を分離し、単体テスト可能にする。

- `parseActionTag(text)` — `[ID:value]` を `id` と `value` に分解。
- `classifyActionTag(tag)` — `GMail` / `GDrive` / `GPhoto` / `GNB` / `AI` を含むアクション種別を返す。
- `classifyGoogleTarget(value, kind)` — IDと検索文字を判定。
- `buildGmailUrl(value)` / `buildGDriveUrl(value)` — URLまたはユーザー向けエラーを返す。
- `buildGPhotoUrl(value)` — Google Photosの許可URLまたは検索URLを返す。
- `buildGeminiNotebookUrl(value)` — Gemini Notebookの許可URLまたはユーザー向けエラーを返す。
- `resolveAiTarget(id)` / `buildAiUrl(target, query)` — 別名の正規化と接続先URL生成。

すべてのURLは固定の `https://` オリジンと `encodeURIComponent` / `URLSearchParams` で組み立て、タグ値をURLスキームやホストとして解釈しない。

### 3.2 カーソルアクション

`src/views/actions/textEditorCursorContentActions.ts` を次のように変更する。

- `classifyTagSubTag` を分離した共通パーサーに置き換え、`gmail`、`gdrive`、`gphoto`、`gnb`、`gtp`、`gpt`、`ag` を大文字・小文字非依存で認識する。
- `TextEditor.CurrentEditor.DoOnCursorPos:GMail:Open` を追加。
- `TextEditor.CurrentEditor.DoOnCursorPos:GDrive:Open` を追加。
- `TextEditor.CurrentEditor.DoOnCursorPos:GPhoto:Open` を追加。
- `TextEditor.CurrentEditor.DoOnCursorPos:GNB:Open` を追加。
- `TextEditor.CurrentEditor.DoOnCursorPos:AI:Open` は既存ActionIDを維持し、GTP/GPT/AGの別名マッピングを追加。
- ステータス結果には「IDを開いた」「検索した」「どのAIを開いた」を区別して表示。機密になりうる検索文全文は結果文に再表示しない。
- 対応しない形式や空値では `window.open` を呼ばない。

### 3.3 タグ挿入・外す・付け替え

`docs/DefaultMenu.md` の「タグ挿入」へ以下を追加する。同一階層のニーモニックが重複しない構成にする。

- `L)Link > M)GMail`
- `L)Link > D)GDrive`
- `L)Link > P)GPhoto`
- `L)Link > N)Gemini Notebook`
- `A)AI > G)GTP`
- `A)AI > C)Claude`
- `A)AI > A)AG`

`TAG_INSERT_TEXT` の現行実装は「閉じ括弧の直前に選択文字を入れる」前提のため、AIタグの `[GTP:>] yyy` を正しく作れない。挿入定義を単なる文字列から、次の情報を持つ記述子へ変更する。

- 挿入テキスト
- キャレット位置
- 選択文字の挿入位置（タグ内またはタグ後方）
- 付け替え時に保持する値の領域

これにより、選択文字をGMail/GDrive/GPhoto/GNBで囲む場合は `[GMail:選択文字]` 等、AIを選ぶ場合は `[GTP:>] 選択文字` になる。Undoは従来どおり1回で戻る。

カーソルメニューには次を追加する。

- `GMail`: 開く/検索、タグを除く、タグを選びなおす。
- `GDrive`: 開く/検索、タグを除く、タグを選びなおす。
- `GPhoto`: 画像リンクを開く/検索、タグを除く、タグを選びなおす。
- `GNB`: Gemini Notebookリンクを開く、タグを除く、タグを選びなおす。
- `AI`: 既存項目を維持。AIタグを外すときは `>` を残さず `yyy` だけを残す。付け替え時は `yyy` を保持したまま接続先だけを変える。

### 3.4 既定タグ定義と設定メモ

`docs/DefaultSearchTag.md` の `## Tag` に `GMail`、`GDrive`、`GPhoto`、`GNB`、`GTP`、`Claude`、`AG` を `NoURL` で追加する。これらは単純な `{0}` URL置換ではなくAction側で分岐するため、`ThinktankSearchTag` メモのLoad/Reset/Save機構との互換性も保つ。

`docs/Thinktank_Status-Action-Binding.md` に下記ActionID、判定規則、例を追記する。

- `TextEditor.CurrentEditor.DoOnCursorPos:GMail:Open`
- `TextEditor.CurrentEditor.DoOnCursorPos:GDrive:Open`
- `TextEditor.CurrentEditor.DoOnCursorPos:GPhoto:Open`
- `TextEditor.CurrentEditor.DoOnCursorPos:GNB:Open`
- 更新後の `TextEditor.CurrentEditor.DoOnCursorPos:AI:Open`

## 4. 作業手順

### 手順1: 純粋関数とテスト

- アクションタグのパーサー、種別判定、ID/検索判定、URLビルダーを分離。
- 先に `src/utils/actionTag.test.ts` を作り、GMail/GDrive/GPhoto/GNB/AIの仕様を固定。
- 既存のThink/Chat/Anchor/WebSearchの分類も回帰テストに入れる。

### 手順2: アクション実装

- GMail/GDrive/GPhoto/GNB Actionを登録し、共通パーサーから分岐。
- AI ActionをGTP/GPT/AGに対応。
- `window.open` をモックしたActionテストを追加し、エラー時に開かないことも確認。

### 手順3: メニューとエディタ編集

- タグ挿入メニューとカーソルメニューを追加。
- 挿入記述子を導入し、選択文字、キャレット位置、Undoをテスト。
- AIタグのDeTag/ReTagでクエリーが欠落・変形しないことをテスト。

### 手順4: 既定定義と仕様書

- `docs/DefaultMenu.md`、`docs/DefaultSearchTag.md`、`docs/Thinktank_Status-Action-Binding.md` を更新。
- `ThinktankSearchTag` へのSaveで新規7件が `NoURL` として欠落しないことを確認。

### 手順5: 回帰確認

- `npx tsc --noEmit`
- 関連Vitest、その後に全テスト
- `npm run build`
- Electron版とブラウザ版で実際に各タグを開く手動確認

## 5. テスト観点

### 自動テスト

- GMail: 16進ID、大文字を含むID、Gmail検索演算子、日本語、空値。
- GDrive: 標準的なID、`_`/`-`を含むID、短い単語、空白と日本語の検索、空値。
- GPhoto: `photos.google.com` と `photos.app.goo.gl` のHTTPS URL、短縮URL、日本語検索、空値、HTTP、ホスト名偽装（例: `photos.google.com.example.test`）。
- GNB: `notebook.google.com` と `notebooklm.google.com` のHTTPS URL、ノートブック/チャット表示/アーティファクトのパスとクエリーの保持、空値、HTTP、IDだけの値、ユーザー情報付きURL、ホスト名偽装。
- AI: GTP/GPT/ChatGPT、Claude、AG/Gemini、大文字・小文字の混在、空クエリー、日本語と記号。
- カーソルがタグの開き/閉じ括弧上、タグ外、同じ行に複数タグがある場合。
- 挿入、選択文のタグ化、DeTag、ReTag、Undo 1回。
- 既存の URL/File/GoogleRoute/YahooTransfer/Think/Chat/Anchor/WebSearch に回帰がないこと。

### 手動テスト

- 複数Googleアカウントのブラウザで `u/0` が想定アカウントになるか。
- GMail/DriveのIDリンク、検索URLが現行のGoogle UIで正しく開くか。
- GPhotoの共有/プロダクトURLが正しく開き、検索ルートが現行Google Photos UIで動作するか。
- GNBの非公開共有、公開共有、チャット表示、アーティファクト共有の各URLが現行のGemini Notebook UIで正しく開くか。
- ChatGPT/Claude/GeminiのURLクエリー付与が現行UIで有効か。サービス側がURLプリフィルを受け付けない場合は「新規会話画面を開く＋クエリーをクリップボードに入れる」への変更を別途判断する。
- ポップアップ防止、未ログイン、対象ID不明の際のユーザー表示。

## 6. リスクと実装前の確認事項

1. **GTP表記**: 本計画では依頼文を優先し `GTP` を正式表記、`GPT` を互換別名とする。単なる誤記で `GPT` のみを正式にしたい場合は実装前に変更する。
2. **AGの意味**: 本計画はAGをAntigravity/Gemini Webの別名と解釈している。ローカル `agy` CLIを実行して回答をThinkに書き込む要件であれば、非同期実行、保存先、キャンセル、Web版のPC連携を含む別設計が必要。
3. **IDと検索文の曖昧性**: 同じ `xxx` 欄で区別するため、形式判定に依存する。有効なID形式が実地テストで異なる場合は正規表現を広げる。判定できない値は検索に倒すことで、誤ったIDページへの遷移を避ける。
4. **Googleアカウント**: URLの `u/0` は最初のログインアカウントを指す。アカウント選択をタグに含める拡張は今回の範囲外。
5. **検索文の露出**: Web検索とAIプリフィルはURL/ブラウザ履歴に残る可能性がある。ステータスバーやログにクエリー全文を重複出力しない。
6. **Google PhotosのIDとURL**: メディアIDは永続的でも、それ単体を開く公式Web URLテンプレートは確認できない。ID直接起動が必須ならPhotos API/Picker APIのOAuth、ID→`productUrl`解決、権限と保存契約を別フェーズで設計する。
7. **共有リンクの機密性**: Google Photosのリンク共有は、URLを知る人に閲覧範囲が広がる可能性がある。タグはURLを正本として保存するため、Think本文の共有先も同じ機密性を引き継ぐ。
8. **Gemini Notebookの共有範囲**: チャット表示のリンクでソースが隠れて見えても、ソースやアーティファクトへの基底のアクセス権は残りうる。GNBタグの保存やThinkの共有は、ノートブック全体の共有設定を確認して行う。
9. **サービス名とドメイン移行**: 現行名のGemini Notebookと旧NotebookLMのリンクが併存する前提で両ホストを許可する。旧ドメインが将来停止しても、互換性のため許可定義はユーザー指示まで残す。

## 7. 完了条件

- 7種類の新規挿入タグ（GMail、GDrive、GPhoto、GNB、GTP、Claude、AG）をメニューから作成できる。
- GMail/GDriveはIDを直接開き、それ以外を検索できる。
- GPhotoはGoogle Photosの許可済み共有/プロダクトURLを開き、URL以外を検索できる。
- GNBはGemini Notebookの許可済み現行/旧ドメインのURLをそのまま開き、不正ホストやURL以外の値を拒否できる。
- GTP/Claude/AGは同じ行の `yyy` を対応するAI画面へ渡せる。
- カーソルからの直接実行、メニュー実行、DeTag、ReTag、選択文字のタグ化が一貫して動く。
- 既存タグと `ThinktankSearchTag` 設定に回帰がない。
- 型検査、自動テスト、ビルドが成功し、Electron/Webの手動確認が完了する。
