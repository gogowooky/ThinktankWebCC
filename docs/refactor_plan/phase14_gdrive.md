# Phase 14: Google Drive連携（メディアストレージ）

## 前提条件
- Phase 01〜09 が完了していること
- GCPプロジェクトで Google Drive API が有効化されていること
- サービスアカウントに Drive APIへのアクセス権が設定済み

## このフェーズの目標
ドラッグ&ドロップされたファイルをGoogle Driveの `yyyy-mm-dd` フォルダへ自動格納する。

---

## 段127: Google Drive APIサービスの実装

`server/src/services/driveService.ts` を作成してください。

```typescript
import { google } from 'googleapis';

export class DriveService {
  private drive: any;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  // 日付フォルダの取得または作成 (親フォルダ: Thinktank)
  async getOrCreateDateFolder(date: string): Promise<string>
  // 例: date='2026-03-16' → GoogleDriveに '2026-03-16' フォルダを作成してIDを返す

  // ファイルのアップロード
  async uploadFile(folderId: string, fileName: string, mimeType: string, buffer: Buffer): Promise<string>
  // → Google Drive上のファイルIDを返す

  // ファイル一覧
  async listFiles(folderId: string): Promise<{id:string, name:string, mimeType:string}[]>
}

export const driveService = new DriveService();
```

---

## 段128: ファイルアップロードAPIの実装

`server/src/routes/driveRoutes.ts` を作成してください。

```
POST /api/drive/upload
  body: multipart/form-data (FileとともにdateおよびmemoIdを含む)
  → 今日の日付フォルダに格納
  → { fileId, webViewLink } を返す
```

- `npm install multer @types/multer` をバックエンドに追加
- 最大ファイルサイズ: 50MB
- ファイル名は元のファイル名をそのまま使用

---

## 段129: ドロップファイル格納Actionの実装

`Application.Drop.Default` Actionを完成させてください。

```typescript
A('Application.Drop.Default', 'ファイルドロップ処理', async (ctx) => {
  const files = ctx.DroppedData?.files as File[];
  if (!files || files.length === 0) return false;

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', new Date().toISOString().slice(0, 10)); // 'yyyy-mm-dd'

    const res = await fetch('/api/drive/upload', {
      method: 'POST',
      body: formData,
    });
    const { fileId, webViewLink } = await res.json();

    // メモタグとしてEditorのカーソル位置に挿入
    // [File:ファイル名](webViewLink) の形式
    app.ActivePanel.EditorBehavior?.InsertAtCursor(`[File:${file.name}](${webViewLink})`);
  }
  return true;
});
```

DefaultEvents.ts に追加:
```typescript
E('*-*-*-*', '', 'DROP', 'Application.Drop.Default');
```

---

## 段130: ドロップ時のビジュアルフィードバック

ファイルドロップ時のUI改善:

- `dragover` イベントでパネルのオーバーレイ表示（「ここにドロップ」）
- `dragleave` で非表示
- アップロード完了後に「✓ 保存完了: ファイル名」をStatusBarに表示
- アップロード失敗時は「× アップロード失敗: エラーメッセージ」を表示

---

## 段131: Google Driveリンクのリクエストタグ登録

DefaultRequests.ts に Drive ファイルのリクエストタグを追加してください。

```typescript
// [File:ファイル名](https://drive.google.com/...) にマッチ
R('File', 'ファイル参照', '\\[File:([^\\]]+)\\]\\(([^)]+)\\)');
```

対応するAction:
```typescript
A('Request.File.Default', 'ファイルを開く', async (ctx) => {
  // ctx.RequestTag から URL を抽出して新しいタブで開く
  return true;
});
```

---

## 段132: Phase10 動作確認チェックリスト

- [ ] ファイルをEditorパネルにドロップしてGoogle Driveの今日の日付フォルダに保存されること
- [ ] StatusBarにアップロード完了メッセージが表示されること
- [ ] EditorにFileタグが挿入されること
- [ ] FileタグをCtrl+Clickして新しいタブでGoogle Driveのファイルが開くこと

---

**前フェーズ**: [Phase 09: AIチャット機能](./phase08_09_memo_ai.md)
**次フェーズ**: [Phase 11: Gmail連携](./phase10_gdrive.md)

---
---