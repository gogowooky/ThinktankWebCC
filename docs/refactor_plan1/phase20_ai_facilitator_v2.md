# Phase 20: AI Facilitator v2 — パターン検出・ダイジェスト・ソクラテス式 ☆新規

## 前提条件
- Phase 19（デプロイ）が完了し、本番環境で稼働していること
- Phase 12（AI Facilitator v1）が動作していること
- Phase 15（ベクトル検索）が利用可能なこと

## このフェーズの目標
AI Facilitatorの高度な機能を実装する。メモ間のパターン検出、定期ダイジェスト生成、
ソクラテス式問いかけにより、知識ベースの「活性化」を深化させる。

---

## 段300: パターン検出エンジン

`src/services/ai/PatternDetector.ts` を作成してください。

```typescript
export interface DetectedPattern {
  type: 'topic_surge' | 'topic_gap' | 'cross_topic' | 'recurring_question';
  title: string;           // 例: "split enzyme関連メモが急増"
  description: string;     // AI生成の説明文
  relatedMemoIds: string[];
  confidence: number;      // 0.0-1.0
}

export class PatternDetector {
  // 直近N日間のメモから頻出トピックの急増を検出
  async detectTopicSurge(memos: TTMemo[], windowDays: number = 30): Promise<DetectedPattern[]>

  // 以前活発だったがN日間触れていないトピックを検出
  async detectTopicGap(memos: TTMemo[], gapDays: number = 60): Promise<DetectedPattern[]>

  // 異なるトピック間の意外な接点を検出（ベクトル類似度活用）
  async detectCrossTopicLinks(memos: TTMemo[]): Promise<DetectedPattern[]>
}
```

パターン検出のAIプロンプト例:
```
以下はユーザーの直近30日のメモタイトルとタグの一覧です。
パターンを分析し、以下の観点で注目すべき傾向を報告してください:
1. 急増しているトピック（以前と比較して）
2. 異なるトピック間に見える共通点や接続
3. 繰り返し現れる疑問や未解決課題
JSON形式で返してください。
```

### 動作確認項目
- 特定トピックのメモが集中した場合、「○○関連メモが急増」とSuggestionsに表示されること

---

## 段301: 定期ダイジェストエンジン

`src/services/ai/DigestGenerator.ts` を作成してください。

```typescript
export interface Digest {
  id: string;
  period: 'weekly' | 'monthly';
  periodStart: string;
  periodEnd: string;
  summary: string;           // AI生成サマリー
  newTopics: string[];       // 新しく登場したトピック
  activeTopics: string[];    // 活発だったトピック
  dormantTopics: string[];   // 活動が低下したトピック
  totalEntries: number;      // 期間中のエントリー数
  entryTypeBreakdown: Record<EntryType, number>; // タイプ別内訳
  highlightMemoIds: string[]; // 注目メモ
}

export class DigestGenerator {
  async generateWeeklyDigest(): Promise<Digest>
  async generateMonthlyDigest(): Promise<Digest>
}
```

---

## 段302: TTDigestsコレクション

```typescript
export class TTDigest extends TTObject {
  public Period: string = 'weekly';
  public PeriodStart: string = '';
  public PeriodEnd: string = '';
  public Summary: string = '';
  public TotalEntries: number = 0;
  public override get ClassName(): string { return 'TTDigest'; }
}

export class TTDigests extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Period,PeriodStart,PeriodEnd,TotalEntries,UpdateDate';
    this.ListProperties = 'Period,PeriodStart,PeriodEnd,TotalEntries';
    this.ColumnMapping = 'Period:期間種別,PeriodStart:開始日,PeriodEnd:終了日,TotalEntries:件数';
  }
  protected CreateChildInstance(): TTDigest { return new TTDigest(); }
}
```

BigQuery:
```sql
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_digests` (
  id STRING NOT NULL,
  period STRING NOT NULL,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  summary STRING,
  topics JSON,
  total_entries INT64,
  highlight_memo_ids JSON,
  created_at TIMESTAMP
);
```

---

## 段303: ダイジェスト自動生成スケジューラ

```typescript
// TTApplication.ts に追加
private _digestScheduler: number | null = null;

public startDigestScheduler(): void {
  // 毎週月曜日の朝9時に週次ダイジェストを生成
  // （簡易実装: 起動時にチェックし、未生成なら生成）
  this._checkAndGenerateDigest();

  // 24時間ごとにチェック
  this._digestScheduler = window.setInterval(() => {
    this._checkAndGenerateDigest();
  }, 24 * 60 * 60 * 1000);
}

private async _checkAndGenerateDigest(): void {
  const lastWeekly = this.models.Digests.getLatestDigest('weekly');
  const daysSinceLastWeekly = lastWeekly
    ? (Date.now() - new Date(lastWeekly.PeriodEnd).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  if (daysSinceLastWeekly >= 7) {
    const digest = await this._digestGenerator.generateWeeklyDigest();
    this.models.Digests.AddItem(digest);
    // Suggestionsに通知
    this._notifyNewDigest(digest);
  }
}
```

Action追加:
```typescript
A('AI.Digest.GenerateWeekly', '週次ダイジェストを手動生成', async (ctx) => { ... });
A('AI.Digest.GenerateMonthly', '月次ダイジェストを手動生成', async (ctx) => { ... });
A('AI.Digest.View', 'ダイジェストをEditorに表示', async (ctx) => { ... });
```

---

## 段304: ソクラテス式問いかけエンジン

`src/services/ai/SocraticDialogue.ts` を作成してください。

```typescript
export class SocraticDialogue {
  // メモ保存時に、内容に対する思考を深める問いかけを生成
  async generateQuestion(content: string): Promise<string | null> {
    if (content.length < 100) return null; // 短いメモはスキップ

    const response = await this._aiApi.complete({
      system: `あなたはソクラテス式対話のファシリテーターです。
ユーザーのメモを読み、思考を深めるための問いかけを1つだけ生成してください。
ルール:
- 批判ではなく、好奇心に基づいた問い
- 「なぜ？」「もし〜だったら？」「別の見方は？」のような開かれた問い
- メモの内容に具体的に即した問い
- 1文で簡潔に
- 答えを誘導しない
問いかけのみを返してください（説明や前置き不要）。`,
      user: content.substring(0, 2000)
    });

    return response?.trim() || null;
  }
}
```

---

## 段305: ソクラテス式問いかけのUI統合

メモ保存後、一定確率（または設定に基づいて）でChatパネルに問いかけを表示します。

```typescript
// メモ保存のフック内
A('AI.Socratic.OnSave', 'メモ保存時の問いかけ', async (ctx) => {
  const enabled = models.Status.GetValue('AI.Facilitator.Socratic') === 'true';
  if (!enabled) return false;

  const memo = ctx.Sender as TTMemo;
  if (!memo || memo.Content.length < 100) return false;

  // 毎回ではなく、3回に1回程度の頻度
  if (Math.random() > 0.33) return false;

  const question = await socraticDialogue.generateQuestion(memo.Content);
  if (question) {
    const suggestion = new TTSuggestion();
    suggestion.Type = 'socratic';
    suggestion.Title = '💭 問いかけ';
    suggestion.Body = question;
    suggestion.RelatedMemoIds = memo.ID;
    suggestion.Priority = 60;
    models.Suggestions.AddItem(suggestion);
  }
  return true;
});
```

---

## 段306: コンテキスト・アウェアネス（時間帯/曜日ベース）

`src/services/ai/ContextAwareness.ts` を作成してください。

```typescript
export class ContextAwareness {
  // 現在の時間帯と曜日から、関連するメモのカテゴリを推定
  getContextHints(): ContextHint {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // 平日の日中 → 仕事関連メモを優先
    if (day >= 1 && day <= 5 && hour >= 9 && hour <= 18) {
      return { preferTags: ['研究', '仕事', 'プロジェクト'], timeContext: 'work' };
    }
    // 早朝 → 日記・振り返り
    if (hour >= 5 && hour <= 8) {
      return { preferTags: ['日記', '振り返り', '目標'], timeContext: 'morning' };
    }
    // 夜 → 個人的なメモ、読書メモ
    if (hour >= 20 || hour <= 4) {
      return { preferTags: ['読書', '個人', 'アイデア'], timeContext: 'evening' };
    }
    return { preferTags: [], timeContext: 'general' };
  }
}
```

---

## 段307: Facilitator設定の拡張

```typescript
S.RegisterState('AI.Facilitator.Socratic', { Default: () => 'true' });
S.RegisterState('AI.Facilitator.PatternDetection', { Default: () => 'true' });
S.RegisterState('AI.Facilitator.WeeklyDigest', { Default: () => 'true' });
S.RegisterState('AI.Facilitator.MonthlyDigest', { Default: () => 'true' });
S.RegisterState('AI.Facilitator.ContextAware', { Default: () => 'true' });
```

---

## 段308〜318: Phase 20 動作確認チェックリスト

- [ ] **段300**: トピック急増がSuggestionsに表示されること
- [ ] **段301-303**: 週次ダイジェストが生成され、EditorでMarkdown表示できること
- [ ] **段304-305**: メモ保存後にソクラテス式問いかけがChatパネルに表示されること
- [ ] **段306**: 時間帯に応じた関連メモの優先度が変化すること
- [ ] すべてのFacilitator機能が個別にON/OFF可能であること
- [ ] オフライン時はAI系機能がスキップされ、エラーにならないこと

---

**前フェーズ**: Phase 19 (デプロイ)
**次フェーズ**: Phase 21 (クイックキャプチャ)
