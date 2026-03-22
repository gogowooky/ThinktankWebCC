# Phase 12: AI Facilitator v1 — プロアクティブリコール・自動タグ

> **補足資料**: 本フェーズの実装時は **[appendix_ai_context_triggers.md](./appendix_ai_context_triggers.md)** も必ず併せてAIに渡してください。
> 本ファイルの段260〜268を実装した後、appendix の段268b〜268g（TTReminder モデル、TriggerMonitor、
> NotificationCenter UI、通知→チャット遷移、リマインダー作成UI、Chatパネルのサブモード分割）を続けて実装してください。

## 前提条件
- Phase 11（AIチャット基盤）が完了していること
- Gemini API または Claude API がバックエンドから利用可能なこと
- TTMemos のメモがBigQuery + IndexedDB に格納されていること

## このフェーズの目標
AI Facilitatorの第一弾として、**アプリ側からユーザーに能動的に働きかける機能**を実装する。
これにより ThinktankWebCC は「自分が操作するツール」から「自分に働きかけてくるスタンド」に質的変化する。

> **Phase 12 完了 = TT Stand のコア体験成立（マイルストーン M3）**

---

## 段260: AI Facilitatorサービスの基盤

`src/services/ai/AIFacilitatorService.ts` を作成してください。

```typescript
export interface Suggestion {
  id: string;
  type: 'recall' | 'auto_tag' | 'related' | 'anniversary' | 'insight';
  title: string;          // 提案のタイトル（例: "1年前のメモ"）
  body: string;           // 提案の本文（AI生成テキスト）
  relatedMemoIds: string[]; // 関連メモのID群
  priority: number;       // 0-100 の優先度
  createdAt: string;      // 提案生成日時
  dismissed: boolean;     // ユーザーが却下したか
  actedOn: boolean;       // ユーザーがアクションを取ったか
}

export class AIFacilitatorService {
  private _apiService: AIApiService; // Phase 09 で実装済みのAI API基盤

  // メモの内容に基づいて関連する過去メモを検索・提案
  async getRelatedRecall(currentMemoId: string): Promise<Suggestion[]>

  // 記念日リコール（N日前、N月前、N年前のメモ）
  async getAnniversaryRecall(): Promise<Suggestion[]>

  // 自動タグ生成
  async generateAutoTags(memoId: string, content: string): Promise<string[]>

  // 最近のメモ群からのインサイト（パターンの兆候）
  async getQuickInsight(recentMemoIds: string[]): Promise<Suggestion | null>
}
```

### 動作確認項目
- `AIFacilitatorService` がインスタンス化できること（テスト用のモックでもOK）

---

## 段261: TTSuggestionクラスとTTSuggestionsコレクション

`src/models/TTSuggestion.ts` を作成してください。

```typescript
export class TTSuggestion extends TTObject {
  public Type: string = 'recall';
  public Title: string = '';
  public Body: string = '';
  public RelatedMemoIds: string = ''; // カンマ区切り
  public Priority: number = 50;
  public Dismissed: boolean = false;
  public ActedOn: boolean = false;

  public override get ClassName(): string { return 'TTSuggestion'; }
}

export class TTSuggestions extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Type,Title,Priority,Dismissed,ActedOn,UpdateDate';
    this.ListProperties = 'Type,Priority,Title,UpdateDate';
    this.ColumnMapping = 'Type:種別,Priority:優先度,Title:提案内容,UpdateDate:日時';
    this.ColumnMaxWidth = 'Type:10,Priority:7,Title:60,UpdateDate:18';
  }

  // 未却下・未対応の提案のみをフィルタ
  public getActiveSuggestions(): TTSuggestion[] {
    return this.GetItems()
      .filter(s => !(s as TTSuggestion).Dismissed && !(s as TTSuggestion).ActedOn)
      .sort((a, b) => (b as TTSuggestion).Priority - (a as TTSuggestion).Priority) as TTSuggestion[];
  }

  protected CreateChildInstance(): TTSuggestion { return new TTSuggestion(); }
}
```

TTModels に `Suggestions: TTSuggestions` を追加してください。

### 動作確認項目
- TTSuggestionsコレクションがTableモードで表示できること

---

## 段262: 記念日リコールエンジン

`src/services/ai/AnniversaryRecallEngine.ts` を作成してください。

AIを使わずにローカルで動作する最もシンプルなリコール機能です。

```typescript
export class AnniversaryRecallEngine {
  // 「N日前」「N週間前」「N月前」「N年前」のメモを検索
  async findAnniversaryMemos(memos: TTMemo[]): Promise<AnniversaryMatch[]> {
    const now = new Date();
    const matches: AnniversaryMatch[] = [];

    for (const memo of memos) {
      const memoDate = this.parseDate(memo.UpdateDate);
      if (!memoDate) continue;

      const diffDays = Math.floor((now.getTime() - memoDate.getTime()) / (1000 * 60 * 60 * 24));

      // 1年前 (±3日の誤差を許容)
      if (Math.abs(diffDays - 365) <= 3) {
        matches.push({ memo, period: '1年前', priority: 90 });
      }
      // 6ヶ月前
      if (Math.abs(diffDays - 182) <= 3) {
        matches.push({ memo, period: '6ヶ月前', priority: 70 });
      }
      // 3ヶ月前
      if (Math.abs(diffDays - 91) <= 3) {
        matches.push({ memo, period: '3ヶ月前', priority: 50 });
      }
      // 1ヶ月前
      if (Math.abs(diffDays - 30) <= 2) {
        matches.push({ memo, period: '1ヶ月前', priority: 40 });
      }
      // 1週間前
      if (diffDays === 7) {
        matches.push({ memo, period: '1週間前', priority: 30 });
      }
    }

    return matches.sort((a, b) => b.priority - a.priority);
  }
}
```

### 動作確認項目
- 1年前のメモが存在する場合、Suggestionsに「1年前のメモ: [タイトル]」が追加されること
- オフラインでも動作すること（IndexedDBのメモメタデータのみ使用）

---

## 段263: 関連メモリコールエンジン（AI活用）

`src/services/ai/RelatedRecallEngine.ts` を作成してください。

```typescript
export class RelatedRecallEngine {
  private _aiApi: AIApiService;

  // 現在表示中のメモの内容から、関連する過去メモを提案
  async findRelatedMemos(currentContent: string, allMemos: TTMemo[]): Promise<Suggestion[]> {
    // 1. 現在のメモの要約をAIで生成（短いプロンプト）
    // 2. 要約のキーワードで全文検索（ローカルまたはBigQuery）
    // 3. 検索結果の上位N件についてAIに「関連度の高い順に並べて」と依頼
    // 4. 上位3件をSuggestionとして返す

    const summary = await this._aiApi.complete({
      system: 'あなたはメモの要約を行うアシスタントです。以下のメモから主要な概念・キーワードを5個抽出してください。',
      user: currentContent.substring(0, 2000) // トークン節約
    });

    const keywords = this.extractKeywords(summary);
    const candidates = await this.searchByKeywords(keywords, allMemos);

    if (candidates.length === 0) return [];

    // AIに関連度判定を依頼
    const ranked = await this._aiApi.complete({
      system: '以下のメモタイトル群から、指定されたキーワードに最も関連の深いものを上位3件選んでください。JSON配列で返してください。',
      user: JSON.stringify({
        keywords,
        candidates: candidates.map(m => ({ id: m.ID, title: m.Name }))
      })
    });

    return this.parseSuggestions(ranked, candidates);
  }
}
```

### 動作確認項目
- EditorでメモをN秒以上閲覧した後、関連メモがSuggestionsに提案されること
- AIが利用できない場合（オフライン）はスキップされ、エラーにならないこと

---

## 段264: 自動タグエンジン

`src/services/ai/AutoTagEngine.ts` を作成してください。

```typescript
export class AutoTagEngine {
  private _aiApi: AIApiService;

  // メモの内容からタグを自動生成
  async generateTags(content: string): Promise<string[]> {
    if (!content || content.length < 50) return []; // 短すぎるメモはスキップ

    const response = await this._aiApi.complete({
      system: `あなたはメモの分類を行うアシスタントです。
以下のメモに適切なタグを3〜5個付けてください。
ルール:
- タグは日本語で、簡潔に（1〜4単語）
- カテゴリとして機能するもの（例: 研究, ペプチド, 日記, アイデア, TODO）
- JSON配列形式で返してください: ["タグ1", "タグ2", ...]`,
      user: content.substring(0, 1500)
    });

    return this.parseTags(response);
  }

  // メモ保存時に自動タグを付与し、metadata.tags_auto に保存
  async tagOnSave(memo: TTMemo): Promise<void> {
    const tags = await this.generateTags(memo.Content);
    if (tags.length > 0) {
      // memo の metadata (BigQuery JSON列) に tags_auto を追加
      // ※ TTMemo の metadata 拡張は Phase 16 で実装するが、
      //   ここでは Keywords プロパティを活用する暫定実装でもOK
      memo.Keywords = tags.join(',');
      memo.NotifyUpdated();
    }
  }
}
```

### 動作確認項目
- メモ保存時に自動タグがKeywordsフィールドに設定されること
- 既存メモに対してバッチで自動タグを付与するActionが動作すること

---

## 段265: Facilitator起動ループ

`src/Views/TTApplication.ts` にFacilitator起動ロジックを追加してください。

```typescript
// TTApplication.ts に追加
private _facilitatorInterval: number | null = null;

public async startFacilitator(): void {
  // 起動時に記念日リコールを実行
  await this._runAnniversaryRecall();

  // 30分ごとに関連メモチェック
  this._facilitatorInterval = window.setInterval(async () => {
    await this._runRelatedRecall();
  }, 30 * 60 * 1000);
}

private async _runAnniversaryRecall(): void {
  const engine = new AnniversaryRecallEngine();
  const memos = this.models.Memos.GetItems() as TTMemo[];
  const matches = await engine.findAnniversaryMemos(memos);

  for (const match of matches.slice(0, 3)) { // 最大3件
    const suggestion = new TTSuggestion();
    suggestion.Type = 'anniversary';
    suggestion.Title = `${match.period}のメモ: ${match.memo.Name}`;
    suggestion.Body = `${match.period}にこのメモを書きました。振り返ってみませんか？`;
    suggestion.RelatedMemoIds = match.memo.ID;
    suggestion.Priority = match.priority;
    this.models.Suggestions.AddItem(suggestion);
  }
}

private async _runRelatedRecall(): void {
  const activePanel = this.ActivePanel;
  if (!activePanel || activePanel.CurrentMode !== 'Editor') return;

  const currentMemo = activePanel.EditorBehavior?.getCurrentMemo();
  if (!currentMemo || !currentMemo.Content) return;

  const engine = new RelatedRecallEngine();
  const suggestions = await engine.findRelatedMemos(
    currentMemo.Content,
    this.models.Memos.GetItems() as TTMemo[]
  );

  for (const suggestion of suggestions) {
    this.models.Suggestions.AddItem(suggestion);
  }
}
```

### 動作確認項目
- アプリ起動時にSuggestionsコレクションに記念日リコールが追加されること
- メモを30分以上閲覧した後、関連メモの提案がSuggestionsに追加されること

---

## 段266: Suggestion通知UI（Chatパネル統合）

ChatパネルにSuggestion通知を表示してください。

```typescript
// 新コンポーネント: src/components/Suggestion/SuggestionPanel.tsx
// Chatパネル内に「AIからの提案」セクションを表示

// Suggestion表示カード:
// ┌──────────────────────────┐
// │ 💡 1年前のメモ            │
// │ "Stomagen研究の初期構想"  │
// │ 振り返ってみませんか？    │
// │ [開く] [後で] [却下]     │
// └──────────────────────────┘

interface SuggestionCardProps {
  suggestion: TTSuggestion;
  onOpen: (memoId: string) => void;   // メモを開く
  onSnooze: (id: string) => void;      // 後で通知
  onDismiss: (id: string) => void;     // 却下
}
```

Action追加:
```typescript
A('AI.Suggestion.Open', '提案のメモを開く', async (ctx) => {
  // RelatedMemoIdsの最初のIDのメモをDeskパネルのEditorで開く
  return true;
});

A('AI.Suggestion.Dismiss', '提案を却下', async (ctx) => {
  // suggestion.Dismissed = true に設定
  return true;
});

A('AI.Suggestion.DismissAll', 'すべての提案を却下', async (ctx) => {
  // アクティブなすべての提案を却下
  return true;
});
```

### 動作確認項目
- ChatパネルにSuggestionカードが表示されること
- 「開く」ボタンで関連メモがDeskパネルに表示されること
- 「却下」ボタンで提案が非表示になること

---

## 段267: 自動タグバッチ処理Action

既存メモに対して一括で自動タグを付与するActionを実装してください。

```typescript
A('AI.Tag.BatchAll', '全メモに自動タグ付与', async (ctx) => {
  const memos = models.Memos.GetItems() as TTMemo[];
  const engine = new AutoTagEngine();
  let processed = 0;

  for (const memo of memos) {
    if (memo.Keywords) continue; // 既にタグがあるメモはスキップ
    if (!memo.IsLoaded) await memo.LoadContent();
    if (!memo.Content || memo.Content.length < 50) continue;

    await engine.tagOnSave(memo);
    processed++;

    // 進捗をStatusBarに表示
    models.Status.SetValue('Application.StatusMessage',
      `自動タグ付与中: ${processed}/${memos.length}`);

    // API レート制限対策: 1秒間隔
    await new Promise(r => setTimeout(r, 1000));
  }

  models.Status.SetValue('Application.StatusMessage',
    `自動タグ付与完了: ${processed}件処理`);
  return true;
});

// メモ保存時の自動タグ付与（新規メモまたはタグ未設定メモ）
A('AI.Tag.OnSave', 'メモ保存時自動タグ', async (ctx) => {
  const memo = ctx.Sender as TTMemo;
  if (!memo || memo.Keywords) return false; // 既にタグがあればスキップ
  const engine = new AutoTagEngine();
  await engine.tagOnSave(memo);
  return true;
});
```

DefaultEvents.ts に追加:
```typescript
E('*-*-*-*', 'Ctrl+Shift', 'T', 'AI.Tag.BatchAll'); // Ctrl+Shift+T: バッチタグ付与
```

### 動作確認項目
- `Ctrl+Shift+T` で全メモの自動タグ付与が開始されること
- 進捗がStatusBarに表示されること
- メモ保存時にタグ未設定メモへの自動タグ付与が動作すること

---

## 段268: Facilitator設定

AI Facilitatorの動作をユーザーが制御できる設定を追加してください。

```typescript
// TTStatus に追加
S.RegisterState('AI.Facilitator.Enabled', { Default: () => 'true' });
S.RegisterState('AI.Facilitator.RecallInterval', { Default: () => '30' }); // 分
S.RegisterState('AI.Facilitator.AutoTag', { Default: () => 'true' });
S.RegisterState('AI.Facilitator.AnniversaryRecall', { Default: () => 'true' });
S.RegisterState('AI.Facilitator.RelatedRecall', { Default: () => 'true' });
```

Action追加:
```typescript
A('AI.Facilitator.Toggle', 'Facilitatorの有効/無効切替', async (ctx) => {
  const current = models.Status.GetValue('AI.Facilitator.Enabled');
  models.Status.SetValue('AI.Facilitator.Enabled', current === 'true' ? 'false' : 'true');
  if (current === 'true') {
    app.stopFacilitator();
  } else {
    app.startFacilitator();
  }
  return true;
});
```

### 動作確認項目
- Facilitatorの有効/無効が切り替えられること
- 無効時はSuggestion生成が停止すること

---

## 段269〜278: Phase 12 動作確認チェックリスト

- [ ] **段260**: AIFacilitatorServiceが初期化できること
- [ ] **段261**: TTSuggestionsがTableに表示されること
- [ ] **段262**: 記念日リコールが動作し、N年前のメモが提案されること
- [ ] **段263**: 関連メモリコールがAIを使って動作すること
- [ ] **段264**: 自動タグがメモ保存時に付与されること
- [ ] **段265**: アプリ起動時にFacilitatorループが開始すること
- [ ] **段266**: ChatパネルにSuggestionカードが表示され、操作できること
- [ ] **段267**: バッチ自動タグ付与が動作すること
- [ ] **段268**: Facilitator設定の切り替えが動作すること
- [ ] **オフライン**: 記念日リコールはオフラインでも動作すること
- [ ] **オフライン**: 自動タグ・関連リコールはオフライン時にスキップされ、エラーにならないこと

---

**前フェーズ**: Phase 11 (AIチャット基盤)
**次フェーズ**: Phase 13 (統一エントリーモデル)
