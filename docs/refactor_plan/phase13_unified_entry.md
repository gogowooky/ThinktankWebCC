# Phase 13: 統一エントリーモデル・メディア取り込み

## 前提条件
- Phase 12（AI Facilitator v1）が完了していること
- BigQueryの `files` テーブルに `metadata` (JSON) 列が存在すること

## このフェーズの目標
テキストメモ以外の情報（画像、音声、動画、URL、位置情報等）を統一的なエントリーとして管理するモデルを構築する。
TTMemoを拡張する形で、多様な粒度の入力を同一スキーマで扱えるようにする。

---

## 段220: TTEntry モデルの設計

`src/models/TTEntry.ts` を作成してください。

TTMemoを継承し、メディア情報を扱うプロパティを追加します。

```typescript
export type EntryType = 'text' | 'image' | 'audio' | 'video' | 'bookmark' | 'location' | 'file';
export type SourceDevice = 'pc' | 'mobile' | 'watch' | 'browser_ext' | 'api' | 'email';

export interface EntryMetadata {
  entry_type: EntryType;
  source_device: SourceDevice;
  geo?: { lat: number; lng: number; place_name?: string };
  media_url?: string;           // Google Drive上のファイルURL
  media_thumbnail?: string;     // サムネイルDataURL（IndexedDBキャッシュ用）
  transcription?: string;       // 音声/動画の文字起こし
  bookmark_url?: string;
  bookmark_title?: string;
  tags_auto?: string[];
  tags_manual?: string[];
  embedding_id?: string;
  related_entries?: string[];
  file_size?: number;
  mime_type?: string;
  duration_seconds?: number;    // 音声/動画の長さ
}

export class TTEntry extends TTMemo {
  public EntryType: EntryType = 'text';
  public SourceDevice: SourceDevice = 'pc';
  public Metadata: EntryMetadata;

  public override get ClassName(): string { return 'TTEntry'; }

  // Content には常にテキスト情報を格納:
  //   text → ユーザー入力テキスト
  //   image → OCR結果 or キャプション
  //   audio → 文字起こしテキスト
  //   video → 文字起こし + キャプション
  //   bookmark → ページタイトル + 抜粋
  //   location → 場所名 + メモ
  //   file → ファイル名 + メタデータテキスト
}
```

### 動作確認項目
- TTEntryがTTMemoを継承し、既存のメモ管理機能がそのまま動作すること

---

## 段221: TTEntriesコレクション

`src/models/TTEntries.ts` を作成してください。

```typescript
export class TTEntries extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Name,EntryType,SourceDevice,Keywords,UpdateDate';
    this.ListProperties = 'EntryType,UpdateDate,Name,Keywords';
    this.ColumnMapping = 'EntryType:種別,UpdateDate:日時,Name:タイトル,Keywords:タグ';
    this.ColumnMaxWidth = 'EntryType:8,UpdateDate:18,Name:50,Keywords:30';
  }

  protected CreateChildInstance(): TTEntry { return new TTEntry(); }
}
```

TTModels に `Entries: TTEntries` を追加してください。

---

## 段222: BigQuery tt_entries テーブル

```sql
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_entries` (
  id STRING NOT NULL,
  name STRING,
  entry_type STRING NOT NULL DEFAULT 'text',
  source_device STRING DEFAULT 'pc',
  content STRING,
  keywords STRING,
  metadata JSON,
  deleted BOOL DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

バックエンドに `/api/bq/entries` のCRUDエンドポイントを追加してください。
既存の `/api/bq/files` と同様の構造で、`tt_entries` テーブルを操作します。

---

## 段223: 画像エントリーの取り込み

画像ファイルをドロップまたは貼り付けた際に、TTEntryとして登録するActionを実装してください。

```typescript
A('Entry.Capture.Image', '画像をエントリーとして保存', async (ctx) => {
  const file = ctx.DroppedData?.files?.[0] as File;
  if (!file || !file.type.startsWith('image/')) return false;

  // 1. サムネイル生成（Canvas API で 200x200 にリサイズ）
  const thumbnail = await generateThumbnail(file, 200, 200);

  // 2. Google Drive にアップロード（Phase 10 の DriveService 利用）
  const driveResult = await uploadToDrive(file);

  // 3. TTEntry作成
  const entry = new TTEntry();
  entry.EntryType = 'image';
  entry.SourceDevice = detectDevice();
  entry.Name = file.name;
  entry.Content = `[画像] ${file.name}`; // テキスト検索用
  entry.Metadata = {
    entry_type: 'image',
    source_device: detectDevice(),
    media_url: driveResult.webViewLink,
    media_thumbnail: thumbnail,
    mime_type: file.type,
    file_size: file.size
  };

  models.Entries.AddItem(entry);
  return true;
});
```

---

## 段224: 音声エントリーの取り込み

`src/services/audio/AudioRecorder.ts` を作成してください。

```typescript
export class AudioRecorder {
  private _mediaRecorder: MediaRecorder | null = null;
  private _chunks: Blob[] = [];

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    this._mediaRecorder.ondataavailable = (e) => this._chunks.push(e.data);
    this._mediaRecorder.start();
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve) => {
      this._mediaRecorder!.onstop = () => {
        resolve(new Blob(this._chunks, { type: 'audio/webm' }));
        this._chunks = [];
      };
      this._mediaRecorder!.stop();
    });
  }
}
```

音声の文字起こし:
```typescript
A('Entry.Capture.Audio', '音声をエントリーとして保存', async (ctx) => {
  const audioBlob = ctx.DroppedData as Blob;

  // 1. Google Drive にアップロード
  // 2. Whisper API または Web Speech API で文字起こし
  // 3. TTEntry作成（Content = 文字起こしテキスト）
});
```

---

## 段225: URLブックマークエントリー

```typescript
A('Entry.Capture.Bookmark', 'URLをブックマークとして保存', async (ctx) => {
  const url = ctx.RequestTag; // [URL:...] のタグから取得、またはクリップボード

  // 1. URLのタイトル・OGP情報を取得（バックエンド経由）
  // 2. TTEntry作成
  const entry = new TTEntry();
  entry.EntryType = 'bookmark';
  entry.Name = pageTitle;
  entry.Content = `${pageTitle}\n${url}\n${description}`;
  entry.Metadata = {
    entry_type: 'bookmark',
    source_device: detectDevice(),
    bookmark_url: url,
    bookmark_title: pageTitle
  };

  models.Entries.AddItem(entry);
  return true;
});
```

---

## 段226: 位置情報エントリー

```typescript
A('Entry.Capture.Location', '現在位置をエントリーとして保存', async (ctx) => {
  if (!navigator.geolocation) return false;

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject);
  });

  const entry = new TTEntry();
  entry.EntryType = 'location';
  entry.Name = `位置メモ ${new Date().toLocaleString()}`;
  entry.Content = ctx.DroppedData?.text || ''; // 添付メモがあれば
  entry.Metadata = {
    entry_type: 'location',
    source_device: detectDevice(),
    geo: {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    }
  };

  models.Entries.AddItem(entry);
  return true;
});
```

---

## 段227: エントリー一覧のフィルタリング

Table表示時にEntryTypeでフィルタできるようにしてください。

```typescript
S.RegisterState('[Panels].Table.EntryTypeFilter', {
  Default: () => 'all', // 'all' | 'text' | 'image' | 'audio' | 'video' | 'bookmark' | 'location'
});
```

---

## 段228〜238: Phase 16 動作確認チェックリスト

- [ ] **段220-221**: TTEntry/TTEntriesが動作し、Tableに表示できること
- [ ] **段222**: BigQueryのtt_entriesテーブルにCRUDが動作すること
- [ ] **段223**: 画像ドロップでTTEntryが作成されること
- [ ] **段224**: 音声録音→文字起こし→TTEntry保存が動作すること
- [ ] **段225**: URL入力でブックマークエントリーが作成されること
- [ ] **段226**: 位置情報エントリーが作成されること
- [ ] **段227**: EntryTypeフィルタが動作すること
- [ ] 全エントリータイプがBigQuery全文検索の対象になること
- [ ] 既存のTTMemoとの後方互換性が維持されていること

---

**前フェーズ**: Phase 12 (AI Facilitator v1)
**次フェーズ**: Phase 14 (Google Drive連携)
