# Phase 16: 出力モード拡張（Timeline・Graph・TTS）

## 前提条件
- Phase 15（ベクトル検索）が完了していること
- IPanelModeBehavior インターフェースが実装されていること（Phase 03-06）

## このフェーズの目標
Editor/Table/WebView の3モードに加えて、Timeline（時系列表示）、Graph（知識グラフ）、
Dashboard（俯瞰ビュー）の出力モードを追加し、知識ベースの多角的な閲覧を可能にする。

---

## 段280: PanelMode の拡張

`src/types/index.ts` を修正してください。

```typescript
export type PanelMode = 'Editor' | 'Table' | 'WebView'
  | 'Timeline' | 'Graph' | 'Dashboard';

export const PanelModes: readonly PanelMode[] = [
  'Editor', 'Table', 'WebView', 'Timeline', 'Graph', 'Dashboard'
] as const;
```

---

## 段281: TTPanelTimelineBehavior の実装

`src/Views/TTPanelTimelineBehavior.ts` を作成してください。

IPanelModeBehavior を実装し、メモ/エントリーを日時軸で表示します。

```typescript
export class TTPanelTimelineBehavior implements IPanelModeBehavior {
  // 日単位・週単位・月単位の切り替え
  // 各日にメモ・エントリーのサマリーカードを表示
  // クリックでDeskパネルのEditorにメモを表示
  // エントリータイプ別のアイコン表示（テキスト📝、画像🖼️、音声🎤、URL🔗等）
}
```

Reactコンポーネント: `src/components/Timeline/TimelineView.tsx`

```typescript
interface TimelineItem {
  id: string;
  date: Date;
  title: string;
  type: EntryType;
  preview: string;    // 最初の100文字
  tags: string[];
}

interface TimelineViewProps {
  items: TimelineItem[];
  viewMode: 'day' | 'week' | 'month';
  onItemClick: (id: string) => void;
}
```

---

## 段282: TTPanelGraphBehavior の実装

`src/Views/TTPanelGraphBehavior.ts` を作成してください。

知識グラフ（メモ間の関連性）をノード＋エッジで可視化します。

依存ライブラリ: `npm install cytoscape` or `d3`

```typescript
export class TTPanelGraphBehavior implements IPanelModeBehavior {
  // ノード: 各メモ/エントリー
  // エッジ: 関連メモ（metadata.related_entries）、共通タグ、セマンティック類似性
  // ノードサイズ: アクセス頻度 or コンテンツ量
  // ノード色: エントリータイプ別
  // クリックでメモを開く、ダブルクリックでフォーカス
}
```

Reactコンポーネント: `src/components/Graph/GraphView.tsx`

```typescript
// Cytoscape.js を使用したグラフ表示
interface GraphNode {
  id: string;
  label: string;
  type: EntryType;
  size: number;
  tags: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'tag' | 'related' | 'semantic';
  weight: number;
}
```

---

## 段283: TTPanelDashboardBehavior の実装

`src/Views/TTPanelDashboardBehavior.ts` を作成してください。

知識ベース全体の俯瞰ビューを表示します。

```typescript
export class TTPanelDashboardBehavior implements IPanelModeBehavior {
  // 表示内容:
  // - メモ総数、今週の新規メモ数
  // - エントリータイプ別の内訳（円グラフ）
  // - 直近のAI Suggestion一覧
  // - タグクラウド（頻出タグの表示）
  // - アクティビティヒートマップ（GitHubの草のような日別表示）
}
```

Reactコンポーネント: `src/components/Dashboard/DashboardView.tsx`

---

## 段284: TTS（音声読み上げ）機能

`src/services/audio/TTSService.ts` を作成してください。

```typescript
export class TTSService {
  // Web Speech API (SpeechSynthesis) を使用
  speak(text: string, options?: { rate?: number; lang?: string }): void {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options?.lang || 'ja-JP';
    utterance.rate = options?.rate || 1.0;
    speechSynthesis.speak(utterance);
  }

  stop(): void { speechSynthesis.cancel(); }
  pause(): void { speechSynthesis.pause(); }
  resume(): void { speechSynthesis.resume(); }
}
```

Action追加:
```typescript
A('Application.TTS.Read', 'メモを読み上げ', async (ctx) => {
  const content = app.ActivePanel?.EditorBehavior?.getContent();
  if (content) ttsService.speak(content);
  return true;
});

A('Application.TTS.Stop', '読み上げ停止', async (ctx) => {
  ttsService.stop();
  return true;
});
```

---

## 段285: モード切替Action

```typescript
A('Application.Panel.SetMode.Timeline', 'Timelineモードに切替', async (ctx) => {
  const panel = app.ActivePanel?.Name;
  if (panel) models.Status.SetValue(`${panel}.Current.Mode`, 'Timeline');
  return true;
});

A('Application.Panel.SetMode.Graph', 'Graphモードに切替', async (ctx) => { /* 同様 */ });
A('Application.Panel.SetMode.Dashboard', 'Dashboardモードに切替', async (ctx) => { /* 同様 */ });
```

DefaultEvents.ts に追加:
```typescript
E('*-*-*-*', 'Alt', '4', 'Application.Panel.SetMode.Timeline');   // Alt+4
E('*-*-*-*', 'Alt', '5', 'Application.Panel.SetMode.Graph');      // Alt+5
E('*-*-*-*', 'Alt', '6', 'Application.Panel.SetMode.Dashboard');  // Alt+6
```

---

## 段286〜298: Phase 19 動作確認チェックリスト

- [ ] **段280**: PanelMode拡張後も既存3モードが正常動作すること
- [ ] **段281**: TimelineViewで日/週/月単位のメモ表示ができること
- [ ] **段282**: GraphViewでメモ間の関連性がノード・エッジで表示されること
- [ ] **段283**: DashboardViewで知識ベースの統計情報が表示されること
- [ ] **段284**: メモの音声読み上げが動作すること
- [ ] **段285**: Alt+4/5/6 でモード切替が動作すること
- [ ] Timeline/Graph/Dashboard がそれぞれクリックでメモをEditorに表示できること

---

**前フェーズ**: Phase 15 (ベクトル検索)
**次フェーズ**: Phase 17 (Gmail連携)
