# Phase 21: クイックキャプチャ（ブラウザ拡張・音声入力） ☆新規

## 前提条件
- Phase 20（AI Facilitator v2）が完了していること
- バックエンドAPIが本番環境で稼働していること

## このフェーズの目標
入力のハードルを極限まで下げ、あらゆるデバイス・状況からの情報キャプチャを実現する。
ブラウザ拡張（Webクリッパー）、PWA Share Target、音声入力、グローバルホットキーを実装する。

---

## 段320: PWA Share Target の実装

`public/manifest.json` にShare Targetを追加してください。

```json
{
  "share_target": {
    "action": "/api/capture/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [{
        "name": "media",
        "accept": ["image/*", "audio/*", "video/*", "application/pdf"]
      }]
    }
  }
}
```

バックエンドに `/api/capture/share` エンドポイントを追加:
```typescript
router.post('/api/capture/share', upload.array('media'), async (req, res) => {
  const { title, text, url } = req.body;
  const files = req.files;
  // TTEntry を作成して保存
  // テキスト → text エントリー
  // URL → bookmark エントリー
  // ファイル → image/audio/video エントリー（Google Drive保存）
});
```

### 動作確認項目
- スマホのブラウザで「共有」→ TT Stand を選択して、テキスト/URL/画像を送信できること

---

## 段321: ブラウザ拡張（Chrome Extension）の作成

`extensions/chrome/` フォルダを作成してください。

```
extensions/chrome/
├── manifest.json       # Chrome Extension Manifest V3
├── popup.html          # ポップアップUI
├── popup.js            # ポップアップロジック
├── content.js          # ページ上のコンテキストメニュー用
├── background.js       # Service Worker
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

```json
// manifest.json
{
  "manifest_version": 3,
  "name": "TT Stand Web Clipper",
  "version": "1.0",
  "permissions": ["contextMenus", "activeTab"],
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }]
}
```

機能:
1. **ポップアップ**: ページタイトル + URL + 選択テキストをワンクリックで保存
2. **右クリックメニュー**: 選択テキストを「TT Standに保存」
3. **ホットキー**: `Ctrl+Shift+S` でクイック保存

```javascript
// background.js
chrome.contextMenus.create({
  id: 'save-to-ttstand',
  title: 'TT Standに保存',
  contexts: ['selection', 'link', 'image']
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const entry = {
    title: tab.title,
    url: tab.url,
    content: info.selectionText || '',
    entry_type: info.mediaType === 'image' ? 'image' : 'bookmark'
  };

  await fetch('https://YOUR_BACKEND_URL/api/capture/extension', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  });
});
```

---

## 段322: 音声入力（Web Speech API）

`src/services/audio/SpeechRecognitionService.ts` を作成してください。

```typescript
export class SpeechRecognitionService {
  private _recognition: SpeechRecognition | null = null;
  private _isListening: boolean = false;

  start(onResult: (text: string) => void, onEnd: () => void): void {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this._recognition = new SpeechRecognition();
    this._recognition.lang = 'ja-JP';
    this._recognition.continuous = true;
    this._recognition.interimResults = true;

    this._recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');
      onResult(transcript);
    };

    this._recognition.onend = onEnd;
    this._recognition.start();
    this._isListening = true;
  }

  stop(): void {
    this._recognition?.stop();
    this._isListening = false;
  }

  get isListening(): boolean { return this._isListening; }
}
```

Action:
```typescript
A('Application.Voice.StartDictation', '音声入力開始', async (ctx) => {
  speechService.start(
    (text) => {
      // Editorのカーソル位置にリアルタイム挿入
      app.ActivePanel?.EditorBehavior?.insertAtCursor(text);
    },
    () => {
      models.Status.SetValue('Application.StatusMessage', '音声入力終了');
    }
  );
  models.Status.SetValue('Application.StatusMessage', '🎤 音声入力中...');
  return true;
});

A('Application.Voice.StopDictation', '音声入力停止', async (ctx) => {
  speechService.stop();
  return true;
});

A('Application.Voice.QuickMemo', '音声クイックメモ', async (ctx) => {
  // 音声を録音 → 文字起こし → 新規TTEntryとして保存
  // 録音は AudioRecorder (Phase 16 段224) を使用
});
```

DefaultEvents:
```typescript
E('*-*-*-*', 'Alt', 'V', 'Application.Voice.StartDictation');
E('*-*-*-*', 'Alt+Shift', 'V', 'Application.Voice.QuickMemo');
```

---

## 段323: PC用グローバルホットキー（PWA対応）

PWAインストール時にグローバルショートカットを設定してください。

```json
// manifest.json に追加
{
  "shortcuts": [
    {
      "name": "クイックメモ",
      "short_name": "Quick",
      "description": "新しいメモを素早く作成",
      "url": "/?action=quick-memo",
      "icons": [{ "src": "/icons/quick-memo.png", "sizes": "96x96" }]
    },
    {
      "name": "音声メモ",
      "short_name": "Voice",
      "description": "音声でメモを作成",
      "url": "/?action=voice-memo"
    }
  ]
}
```

---

## 段324: キャプチャAPI統合エンドポイント

すべてのキャプチャソースを統一的に受け付けるAPIエンドポイント:

```typescript
// server/routes/captureRoutes.ts
router.post('/api/capture', async (req, res) => {
  const { source, entry_type, title, content, url, metadata } = req.body;
  // source: 'web' | 'extension' | 'share' | 'api' | 'voice' | 'watch'
  // → TTEntry を作成
  // → Auto-tag を非同期で実行（queue）
  // → Embedding生成をキューに追加
});
```

---

## 段325〜336: Phase 21 動作確認チェックリスト

- [ ] **段320**: スマホから「共有」でTT Standにテキスト/URL/画像を送信できること
- [ ] **段321**: Chrome拡張からWebページの選択テキスト/URLを保存できること
- [ ] **段322**: `Alt+V` で音声入力が開始/停止できること
- [ ] **段322**: `Alt+Shift+V` で音声クイックメモが作成されること
- [ ] **段323**: PWAショートカットからクイックメモ/音声メモが起動すること
- [ ] **段324**: すべてのキャプチャソースが統一APIを通じてTTEntryになること
- [ ] キャプチャされたエントリーに自動タグが付与されること

---

**前フェーズ**: Phase 20☆ (AI Facilitator v2)
**次フェーズ**: Phase 22☆ (クロスプラットフォーム)
